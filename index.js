// @ts-check

function coldskyDIDs() {

  async function load() {
    const startLoading = Date.now();
    statusBar.textContent = 'Restoring auth...';
    const auth = initAuth();

    statusBar.textContent = 'Detecting cursors...';

    /** @type {import('./cursors.json')} */
    const cursors = await fetch(relativeURL('cursors.json')).then(x => x.json());
    let reflectCursor = cursors.listRepos.cursor;

    statusBar.textContent = 'Hydrating...';

    payload.className = 'payload payload-show';

    const matrixElement = /** @type {HTMLElement} */(document.querySelector('.matrix'));
    //const bucketsAndElements = createBucketElements(matrixElement);
    const gitAuthPanel = /** @type {HTMLElement} */(document.querySelector('.git-auth-panel'));

    const knownDidsTitleNumberElement = /** @type {HTMLElement} */(document.querySelector('.dids-title-number'));
    const newDidsTitleNumberElement = /** @type {HTMLElement} */(document.querySelector('.new-dids-title-number'));
    const newDidsTitleExtraElement = /** @type {HTMLElement} */(document.querySelector('.new-dids-title-extra'));
    const totalDidsTitleNumberElement = /** @type {HTMLElement} */(document.querySelector('.total-dids-title-number'));

    const pumpingState = loadBucketsAndPullNewDIDs();
    const renderedBuckets = renderBuckets(matrixElement);

    showReadme();

    await pumpUpdates();
    statusBar.textContent = 'Updated in ' + ((Date.now() - startLoading) / 1000).toFixed() + ' s.';

    async function showReadme() {
      const readmeHost = /** @type {HTMLElement} */(document.querySelector('#readme-host'));
      const readmePeekButton = /** @type {HTMLElement} */(document.querySelector('.readme-peek-button'));

      const readmeText = await loadReadme;
      const readmeContentElement = document.createElement('div');
      readmeContentElement.className = 'md-content';
      readmeContentElement.innerHTML = marked.marked(readmeText);

      readmeHost.appendChild(readmeContentElement);
      readmeHost.style.display = 'block';
      readmePeekButton.onclick = () => {
        readmeContentElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
          inline: 'start'
        });
      };
    }

    function tryCommit() {
      const startCommitting = Date.now();
      pauseUpdatesPromise = (async () => {
        githubCommitStatus.textContent = '';
        statusBar.textContent = 'Authenticating...';
        try {
          githubCommitButton.disabled = true;
          gitAuthPanel.classList.add('github-commit-in-progress');

          const authToken = auth.startCommit();

          let firstFetch = true;
          const prepare = await webcommit({
            auth: authToken,
            owner: 'colds-ky',
            repo: 'dids',
            branch: 'main',
            fetch: (req, init) => {
              if (firstFetch) {
                // first fetch needs to succeed normally: no sense retrying on authentication errors
                firstFetch = false;
                return fetch(req, init);
              }

              return retryFetch(req, { ...init, corsproxy: false });
            }
          });
          console.log('commit: ', prepare);
          try {
            localStorage.setItem('github-auth-token', authToken);
          } catch (error) {
            console.warn('Cannot store auth in local storage');
          }

          githubCommitStatus.textContent = 'Preparing summary...';

          await prepare.put(
            'cursors.json',
            JSON.stringify({
            ...cursors,
            listRepos: {
              cursor: pumpingState.cursors.lastSuccess || reflectCursor,
              timestamp: new Date().toISOString(),
              client:
                (navigator.platform ?
                  'web/' + (navigator.platform.replace(/win32/i, 'win')) :
                  'web') + ' ' +
                (!navigator.userAgent ? '' :
                  ' ' +
                  (/mobile/i.test(navigator.userAgent) ? 'mobile ' : '') +
                  navigator.userAgent.trim().split(/\s+/g).slice(-1)[0]) +
                (!prepare.head.sha ? ' git:?' :
                  ' git:' + prepare.head.sha.slice(0, 7))
            }
          }, null, 2));

          statusBar.textContent = 'Preparing atomic commit...';
          githubCommitStatus.textContent = 'Updating files...';

          let totalFiles = 0;
          let incrementChars = 0;
          let totalChars = 0;
          const updatedFiles = [];
          const singleSet = new Set();

          /** @param {string} twoLetterKey */
          const commitBucket = async twoLetterKey => {
            const bucket = renderedBuckets.buckets[twoLetterKey];
            if (!bucket.originalJSONText || !bucket.newShortDIDs?.size) {
              console.log('JSON text is not retrieved: ' + twoLetterKey);
              return;
            }

            const lead = bucket.originalJSONText.replace(/\s*\]\s*$/, '');
            const incrementJSON = packDidsJson([...bucket.newShortDIDs], ',\n', '\n]\n');
            const path = getShardBucketPath(twoLetterKey);

            await prepare.put(path, lead + incrementJSON);

            updatedFiles.push(path);

            incrementChars += incrementJSON.length;
            totalFiles++;
            totalChars += lead.length + incrementJSON.length;
          };

          /** @type {string[][]} */
          const parallelSets = [];
          const PARALLEL_SET_SIZE = 16;
          for (const twoLetterKey in renderedBuckets.buckets) {
            const bucket = renderedBuckets.buckets[twoLetterKey];
            if (!bucket.originalJSONText || !bucket.newShortDIDs?.size) {
              continue;
            }

            if (parallelSets.length && parallelSets[parallelSets.length - 1].length < PARALLEL_SET_SIZE)
              parallelSets[parallelSets.length - 1].push(twoLetterKey);
            else
              parallelSets.push([twoLetterKey]);
          }

          for (const set of parallelSets) {
            githubCommitStatus.textContent = 'Updating files: ' + set.join(',') + ' (' + updatedFiles.length + ')...';
            await Promise.all(set.map(commitBucket));
            singleSet.clear();
            for (const twoLetterKey of set) {
              singleSet.add(twoLetterKey);
            }
            renderedBuckets(singleSet, true);

          }

          githubCommitStatus.textContent = 'Committing changes...';
          statusBar.textContent = 'GitHub...';

          githubCommitStatus.textContent =
            'Commit ' + totalFiles + ' files,' +
            ' +' + incrementChars.toLocaleString() + 'ch ' +
            totalChars.toLocaleString() + ' total...';

          console.log('changeFiles: ', updatedFiles);

          const commitMessage =
            pumpingState.knownAccounts.toLocaleString() +
            '+' + pumpingState.newAccounts.toLocaleString() +
            ' to ' + (pumpingState.knownAccounts + pumpingState.newAccounts).toLocaleString() + ' dids';

          await prepare.commit(commitMessage);

          githubCommitStatus.textContent = 'OK.';


          githubCommitStatus.textContent = 'Committed ' + commitMessage + '.';
          const completeLabel = document.createElement('div');
          completeLabel.className = 'complete-label';
          completeLabel.textContent = ' \u2714 Done.';
          githubCommitStatus.appendChild(completeLabel);
          statusBar.textContent = 'Saved changes in ' + ((Date.now() - startCommitting) / 1000).toFixed() + ' s.';
          auth.commitSucceeded();

        } catch (error) {
          auth.commitFailed();
          gitAuthPanel.classList.remove('github-commit-in-progress');
          const errorLabel = document.createElement('div');
          errorLabel.className = 'error-label';
          for (const ln of (error?.stack || error?.message || error).split('\n')) {
            const line = document.createElement('div');
            line.textContent = ln;
            errorLabel.appendChild(line);
          }
          githubCommitStatus.appendChild(errorLabel);
          alert('GithHub update failed: ' + (error?.message || error));
        }
      })();
    }

    function updateTitles() {
      knownDidsTitleNumberElement.textContent =
        pumpingState.knownAccounts.toLocaleString();

      newDidsTitleNumberElement.textContent =
        pumpingState.newAccounts.toLocaleString();

      totalDidsTitleNumberElement.textContent =
        (pumpingState.knownAccounts + pumpingState.newAccounts).toLocaleString();

      const reflectCursorText =
        pumpingState.cursors.lastSuccess && pumpingState.cursors.lastSuccess.toLocaleString()
        || reflectCursor;

      newDidsTitleExtraElement.textContent =
        pumpingState.pullError ?
          'cursor: ' + reflectCursorText + ' (' + pumpingState.pullError.tries + ' errors)' :
          'cursor: ' + reflectCursorText;

      if (pumpingState.allAccountsLoaded && pumpingState.newAccounts) {
        // and all buckets are populated
        if (githubCommitButton.disabled) {
          githubCommitButton.disabled = false;
          statusBar.textContent = 'Pumping new accounts...';
        }

        githubCommitButton.onclick = tryCommit;
      }

    }

    async function pumpUpdates() {
      while (pumpingState.nextUpdate) {
        const changes = await pumpingState.nextUpdate;
        renderedBuckets(changes);
        updateTitles();
      }
    }

    /** @param {HTMLElement} matrixElement */
    function renderBuckets(matrixElement) {
      BucketRenderer.prototype.update = updateBucket;

      /** @type {{ [twoLetterKey: string]: BucketRenderer }} */
      const rendererByTwoLetterKey = {};
      new BucketRenderer('web', 1, letters.length);

      for (let iFirstLetter = 0; iFirstLetter < letters.length; iFirstLetter++) {
        for (let iSecondLetter = 0; iSecondLetter < letters.length; iSecondLetter++) {
          const twoLetterKey = letters[iFirstLetter] + letters[iSecondLetter];
          new BucketRenderer(twoLetterKey, iFirstLetter + 2, iSecondLetter + 1);
        }
      }

      updateBuckets.buckets = {};
      for (const renderer of Object.values(rendererByTwoLetterKey)) {
        matrixElement.appendChild(renderer.element);
        updateBuckets.buckets[renderer.bucket.twoLetterKey] = renderer.bucket;
      }

      return /** @type {typeof updateBuckets & { buckets: { [twoLetterKey: string]: BucketData }}} */(
        updateBuckets
      );

      /**
       * @param {{ has(twoLetterKey: string): boolean  }} [recentBuckets]
       * @param {boolean} [commit]
       */
      function updateBuckets(recentBuckets, commit) {
        for (const renderer of Object.values(rendererByTwoLetterKey)) {
          const recent = !!recentBuckets?.has(renderer.bucket.twoLetterKey);
          renderer.update(recent, recent && !!commit);
        }
      }

      /**
       * @param {string} twoLetterKey
       * @param {number} column
       * @param {number} row
       */
      function BucketRenderer(twoLetterKey, column, row) {
        this.bucket = pumpingState.buckets[twoLetterKey];
        this.element = createElementForBucket(column, row);
        if (this.bucket.randomAlt) this.element.classList.add('random-alt');
        this.errorClass = false;
        this.loadedClass = false;
        this.hasUpdatesClass = false;
        this.hasRecentUpdatesClass = false;
        this.committing = false;
        this.update(false);
        rendererByTwoLetterKey[twoLetterKey] = this;
      }

      /**
       * @this {BucketRenderer}
       * @param {boolean} recentUpdates
       * @param {boolean} [asCommit]
       */
      function updateBucket(recentUpdates, asCommit) {
        const errorClass = !!this.bucket.error;
        const loadedClass = !isPromise(this.bucket.originalShortDIDs);
        const hasUpdatesClass = !!this.bucket.newShortDIDs?.size;

        if (errorClass !== this.errorClass) {
          this.element.classList.toggle('error-bucket', errorClass);
          this.errorClass = errorClass;
        }

        if (loadedClass !== this.loadedClass) {
          this.element.classList.toggle('loaded', loadedClass);
          this.loadedClass = loadedClass;
        }

        if (hasUpdatesClass !== this.hasUpdatesClass) {
          this.element.classList.toggle('new-dids', hasUpdatesClass);
          this.hasUpdatesClass = hasUpdatesClass;
        }

        if (recentUpdates !== this.hasRecentUpdatesClass) {
          this.element.classList.toggle('fresh', recentUpdates);
          this.hasRecentUpdatesClass = recentUpdates;
        }

        if (asCommit !== this.committing) {
          this.element.classList.toggle('committing', !!asCommit);
          this.committing = !!asCommit;
        }
      }

      /**
       * @param {number} column
       * @param {number} row
       */
      function createElementForBucket(column, row) {
        const bucketElement = document.createElement('div');
        bucketElement.className = 'matrix-element';
        bucketElement.style.gridColumn = String(column);
        bucketElement.style.gridRow = String(row);
        return bucketElement;
      }
    }
  }

  function initAuth() {
    const AUTH_STORAGE_KEY = 'github-auth-cached';
    const KEY_EMOJI = '\ud83d\udd11';

    let committingAuth;

    try {
      if (localStorage.getItem(AUTH_STORAGE_KEY))
        githubAuthTokenInput.value = KEY_EMOJI;
    } catch (localStorageError) {
      console.warn('Cannot retrieve ' + AUTH_STORAGE_KEY + ' from localStorage ', localStorageError);
    }

    return {
      startCommit,
      commitSucceeded,
      commitFailed
    };

    function startCommit() {
      committingAuth =
        (githubAuthTokenInput.value === KEY_EMOJI ?
          localStorage.getItem(AUTH_STORAGE_KEY) : '') ||
        githubAuthTokenInput.value;

      if (!committingAuth) throw new Error('AUTH is not provided.');
      githubAuthTokenInput.disabled = true;
      return committingAuth;
    }

    function commitSucceeded() {
      githubAuthTokenInput.disabled = false;
      if (githubAuthTokenInput.value !== KEY_EMOJI) {
        try {
          localStorage.setItem(AUTH_STORAGE_KEY, committingAuth);
        } catch (localStorageError) {
          console.warn('Cannot store ' + AUTH_STORAGE_KEY + ' to localStorage ', localStorageError);
        }
      }
    }

    function commitFailed() {
      githubAuthTokenInput.disabled = false;
    }
  }

  function loadBucketsAndPullNewDIDs() {

    /** @param {{  has(twoLetterKey: string): boolean }} [buckets] */
    let nextUpdateResolve = (buckets) => { };
    const result = {
      knownAccounts: 0,
      newAccounts: 0,
      /** @type {BucketData[]} */
      updatedBuckets: [],
      cursors: {
        json: /** @type {import('./cursors.json')} */({}),
        /** @type {number | undefined} */
        original: undefined,
        /** @type {number | undefined} */
        lastSuccess: undefined
      },
      /** @type {{ [twoLetterKey: string]: BucketData }} */
      buckets: {},
      /** @type {ErrorStats | undefined} */
      pullError: undefined,
      allAccountsLoaded: false,
      allNewDIDsLoaded: false,
      /** @type {Promise | undefined} */
      pauseUpdatesPromise: undefined,
      /** @type {Promise<{ has(twoLetterKey: string): boolean } | undefined> | undefined} */
      nextUpdate: new Promise(resolve => nextUpdateResolve = resolve)
    };

    pumpNewDIDs();
    initAllBuckets();

    return result;

    /** @param {{  has(twoLetterKey: string): boolean  }} [buckets] */
    function triggerUpdate(buckets) {
      const tick = nextUpdateResolve;
      if (!result.allAccountsLoaded || !result.allNewDIDsLoaded)
        result.nextUpdate = new Promise(resolve => nextUpdateResolve = resolve);

      result.newAccounts = 0;
      result.knownAccounts = 0;
      for (const bucket of Object.values(result.buckets)) {
        result.knownAccounts += isPromise(bucket.originalShortDIDs) ? 0 : bucket.originalShortDIDs.size;
        result.newAccounts += bucket.newShortDIDs?.size || 0;
      }

      tick(buckets);
    }

    async function pumpNewDIDs() {
      result.cursors.json = await fetchCursorsJSON();
      result.cursors.original = Number(result.cursors.json.listRepos.cursor) || undefined;

      /** @type {Set<string>} */
      const triggerBuckets = new Set();
      for await (const block of pullNewShortDIDs(result.cursors.original)) {
        await result.pauseUpdatesPromise;

        if (block.error) {
          result.pullError = block.error;
          triggerUpdate();
          continue;
        }

        result.cursors.lastSuccess = Number(block.cursor);
        triggerBuckets.clear();

        for (const shortDID of block.shortDIDs) {
          const twoLetterKey = getTwoLetterKey(shortDID);
          const bucket = result.buckets[twoLetterKey];

          if (!isPromise(bucket.originalShortDIDs)
            && bucket.originalShortDIDs.has(shortDID))
            continue;

          const sizeBefore = bucket.newShortDIDs?.size || 0;
          if (!bucket.newShortDIDs) bucket.newShortDIDs = new Set();
          bucket.newShortDIDs.add(shortDID);
          if (bucket.newShortDIDs.size > sizeBefore) {
            if (!sizeBefore) result.updatedBuckets.push(bucket);

            result.newAccounts++;
            triggerBuckets.add(twoLetterKey);
          }
        }

        if (triggerBuckets.size) {
          triggerUpdate(triggerBuckets);
        }
      }

      result.allAccountsLoaded = true;
      triggerUpdate();

      async function fetchCursorsJSON() {
        const startDate = Date.now();
        while (true) {
          try {
            /** @type {import('./cursors.json')} */
            const cursorsJSON = await fetch('./cursors.json', { cache: 'reload' })
              .then(x => x.json());
            await pauseUpdatesPromise;

            return cursorsJSON;
          } catch (fetchCursorError) {
            let waitFor = Math.min(
              45000,
              Math.max(300, (Date.now() - startDate) / 3)
            ) * (0.7 + Math.random() * 0.6);
            let retryAt = Date.now() + waitFor;

            await pauseUpdatesPromise;
            waitFor = Math.max(0, retryAt - Date.now());

            if (!result.pullError) {
              result.pullError = {
                current: fetchCursorError,
                started: Date.now(),
                tries: 1,
                retryAt: Date.now() + waitFor
              };
            } else {
              result.pullError.current = fetchCursorError;
              result.pullError.tries++;
              result.pullError.retryAt = Date.now() + waitFor;
            }

            console.warn('./cursors.json: delay ', waitFor, 'ms ', fetchCursorError);
            await new Promise(resolve => setTimeout(resolve, waitFor));
          }
        }
      }
    }

    function initAllBuckets() {
      /** @type {Set<string>} */
      const singleSet = new Set();
      result.buckets['web'] = createBucket('web');
      for (let iFirstLetter = 0; iFirstLetter < letters.length; iFirstLetter++) {
        for (let iSecondLetter = 0; iSecondLetter < letters.length; iSecondLetter++) {
          const twoLetterKey = letters[iFirstLetter] + letters[iSecondLetter];
          result.buckets[twoLetterKey] = createBucket(twoLetterKey);
        }
      }

      let outstandingBuckets = 0;
      for (const twoLetterKey in result.buckets) {
        const bucket = result.buckets[twoLetterKey];
        if (isPromise(bucket.originalShortDIDs)) {
          outstandingBuckets++;
          bucket.originalShortDIDs.then(() => updateBucketFetched(bucket));
        } else {
          result.knownAccounts += bucket.originalShortDIDs.size;
        }
      }

      /**
       * @param {BucketData} bucket 
       */
      function updateBucketFetched(bucket) {
        result.knownAccounts += /** @type {Set<string>} */(bucket.originalShortDIDs).size;
        outstandingBuckets--;

        if (!outstandingBuckets) result.allAccountsLoaded = true;

        singleSet.clear();
        singleSet.add(bucket.twoLetterKey);
        triggerUpdate(singleSet);
      }
    }

  }

  /**
   * @param {number | undefined} originalCursor
   */
  async function* pullNewShortDIDs(originalCursor) {
    let cursor = originalCursor;

    let lastStart = Date.now();
    let fetchErrorStart;
    let errorCount = 0;

    // first cycles always forced - because it was the last one last time
    let forceCycles = 2;
    let lastFruitfulCursor = originalCursor;
    /** @type {{ [cursor: string]: number }} */
    let retriesFor = {};
    while (true) {
      try {
        const fetchForCursor = cursor;
        const fetchURL =
          'https://corsproxy.io/?' +
          'https://bsky.network/xrpc/com.atproto.sync.listRepos?' +
          'limit=' + (forceCycles ? '995' : '998') +
          (fetchForCursor ? '&cursor=' + fetchForCursor : '') +
          '&t=' + Date.now();

        const resp = forceCycles ?
          await fetch(fetchURL, { cache: 'reload' }) :
          await fetch(fetchURL);

        await pauseUpdatesPromise;

        let data = await resp.json();
        await pauseUpdatesPromise;

        let canContinue = true;

        if (data.cursor && data?.repos?.length > 10) {
          cursor = data.cursor;
          if (forceCycles) forceCycles--;
        } else if (forceCycles && retriesFor[String(fetchForCursor)] > 4) {
          canContinue = false;
        } else {
          // data is empty or incomplete: try again
          forceCycles = 2;
          retriesFor[String(fetchForCursor)] = (retriesFor[String(fetchForCursor)] || 0) + 1;
          cursor = lastFruitfulCursor;
          continue;
        }

        fetchErrorStart = undefined;
        errorCount = 0;
        lastStart = Date.now();

        if (data?.repos?.length) {
          /** @type {string[]} */
          const shortDIDs = data.repos.map(repo => shortenDID(repo.did));
          lastFruitfulCursor = fetchForCursor;
          yield {
            shortDIDs,
            originalCursor,
            cursor: fetchForCursor, // return a cursor that has worked
            error: undefined
          };
        }

        if (!canContinue) break;
      } catch (error) {
        if (!fetchErrorStart)
          fetchErrorStart = Date.now();
        errorCount++;

        const waitFor = Math.min(
          45000,
          Math.max(300, (Date.now() - lastStart) / 3)
        ) * (0.7 + Math.random() * 0.6);
        console.warn('delay ', waitFor, 'ms ', error);

        yield {
          shortDIDs: undefined,
          originalCursor,
          cursor,
          /** @type {ErrorStats} */
          error: {
            current: error,
            retryAt: Date.now() + waitFor,
            tries: errorCount,
            started: fetchErrorStart
          }
        };

        await new Promise(resolve => setTimeout(resolve, waitFor));
      }
    }
  }

  /**
   * @typedef {{
   *  randomAlt: boolean;
   *  twoLetterKey: string;
   *  originalShortDIDs: Promise<Set<string>> | Set<string>;
   *  originalJSONText: string | undefined;
   *  newShortDIDs: Set<string> | undefined;
   *  error: ErrorStats | undefined;
   * }} BucketData
   */

  /**
   * @typedef {{
   *  current: Error | undefined,
   *  tries: number,
   *  started: number,
   *  retryAt: number
   * }} ErrorStats
   */

  /** @param {string} twoLetterKey */
  function createBucket(twoLetterKey) {
    /** @type {BucketData} */
    const bucket = {
      randomAlt: Math.random() > 0.5,
      twoLetterKey,
      originalShortDIDs: loadOriginalShortDIDs(),
      originalJSONText: undefined,
      newShortDIDs: undefined,
      error: undefined
    };

    return bucket;

    async function loadOriginalShortDIDs() {
      const start = Date.now();
      let errorReported = false;

      while (true) {
        try {
          const shardURL = relativeURL(getShardBucketPath(twoLetterKey));
          const shardText = await fetch(shardURL).then(x => x.text());
          const shardData = JSON.parse(shardText);
          if (errorReported)
            bucket.error = undefined;
          bucket.originalShortDIDs = new Set(shardData);
          bucket.originalJSONText = shardText;

          if (bucket.newShortDIDs) {
            const removeAlreadyFetchedShortDIDs = [];
            for (const shortDID in bucket.newShortDIDs) {
              if (bucket.originalShortDIDs.has(shortDID))
                removeAlreadyFetchedShortDIDs.push(shortDID);
            }

            if (removeAlreadyFetchedShortDIDs.length) {
              for (const removeShortDID of removeAlreadyFetchedShortDIDs) {
                bucket.newShortDIDs.delete(removeShortDID);
              }
            }
          }

          return bucket.originalShortDIDs;
        } catch (error) {
          const waitFor = Math.min(
            30000,
            Math.max(300, (Date.now() - start) / 3)
          ) * (0.7 + Math.random() * 0.6);

          if (bucket.error) {
            bucket.error.current = error;
            bucket.error.retryAt = Date.now() + waitFor;
            bucket.error.tries++;
          } else {
            bucket.error = {
              current: error,
              retryAt: Date.now() + waitFor,
              started: Date.now(),
              tries: 1
            };
          }

          console.warn('delay ', waitFor, 'ms ', error);
          await new Promise(resolve => setTimeout(resolve, waitFor));
        }
      }
    }
  }

  /** @param {string[]} dids */
  function packDidsJson(dids, lead = '[\n', tail = '\n]\n') {
    const DIDS_SINGLE_LINE = 6;
    const didsLines = [];
    for (let i = 0; i < dids.length; i += DIDS_SINGLE_LINE) {
      const chunk = dids.slice(i, i + DIDS_SINGLE_LINE);
      const line = chunk.map(shortDID => '"' + shortDID + '"').join(',');
      didsLines.push(line);
    }

    return lead + didsLines.join(',\n') + tail;
  }

  /** @param {string} did */
  function getTwoLetterKey(did) {
    if (did.length === 2 || did === 'web') return did;

    const shortDID =
      // @ts-ignore
      shortenDID(did);

    const twoLetterKey = shortDID.indexOf(':') >= 0 ? 'web' : shortDID.slice(0, 2);
    return twoLetterKey;
  }

  /** @param {string} twoLetterKeyOrDID */
  function getShardBucketPath(twoLetterKeyOrDID) {
    const twoLetterKey = getTwoLetterKey(twoLetterKeyOrDID);
    if (twoLetterKey === 'web') return 'web.json';
    else return twoLetterKey[0] + '/' + twoLetterKey + '.json';
  }

  /**
 * @param {T} did
 * @returns {T}
 * @template {string | undefined | null} T
 */
  function shortenDID(did) {
    return did && /** @type {T} */(did.replace(_shortenDID_Regex, '').toLowerCase() || undefined);
  }

  const _shortenDID_Regex = /^did\:plc\:/;


  /**
 * @param {any} x
 * @returns {x is Promise<any>}
 */
  function isPromise(x) {
    if (!x || typeof x !== 'object') return false;
    else return typeof x.then === 'function';
  }


  /** @param {string} url */
  function relativeURL(url) {
    return /http/i.test(location.protocol || '') ? url : 'https://dids.colds.ky/' + url;
  }

  // @ts-check

  /**
   * @typedef {{
   *  owner: string,
   *  repo: string,
   *  branch?: string,
   *  fetch?: typeof fetch,
   *  auth?: string,
   *  octokit?: import("@octokit/rest").Octokit
   * }} PrepareParams
   */

  /**
   * @typedef {{
   *  head: CommitData,
   *  put(file: string, content: string | ArrayBuffer | Uint8Array, mode?: string | number): Promise<TreeItem>,
   *  remove(file: string): Promise<TreeItem>,
   *  commit(message: string): Promise<CommitData>
   * }} Committer
   */

  /** @typedef {NonNullable<Parameters<import('@octokit/rest').Octokit['rest']['git']['createTree']>[0]>['tree'][0]} TreeItem */

  /** @typedef {Awaited<ReturnType<import('@octokit/rest').Octokit['rest']['git']['getCommit']>>['data']} CommitData */

  /**
   * @param {PrepareParams} params
   * @returns {Promise<Committer>}
   */
  async function webcommit({
    owner, repo, branch,
    fetch = defaultFetch(),
    auth,
    octokit }) {

    const headers = {
      ...(auth && { Authorization: `token ${auth}` }),
      Accept: "application/vnd.github.v3+json"
    };

    /** @type {Awaited<ReturnType<import('@octokit/rest').Octokit['rest']['git']['getRef']>>['data']} */
    const ref = await (octokit ?
      octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` }).then(res => res.data) :
      fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`, { headers }).then(x => x.json()));

    /** @type {CommitData} */
    const headCommit = await (octokit ?
      octokit.rest.git.getCommit({ owner, repo, commit_sha: ref.object.sha }).then(res => res.data) :
      fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits/${ref.object.sha}`, { headers }).then(x => x.json()));

    /**
     * @type {TreeItem[]}
     */
    const tree = [];

    return {
      head: headCommit,
      put, remove,
      commit
    };

    /**
     * @param {string} file
     * @param {string | ArrayBuffer | Uint8Array} content
     * @param {string | number} mode
     */
    async function put(file, content, mode) {
      const encodedBlob = toBase64(content);
      /** @type {Awaited<ReturnType<import('@octokit/rest').Octokit['rest']['git']['createBlob']>>['data']} */
      const blob = await (octokit ?
        octokit.rest.git.createBlob({ owner, repo, content: encodedBlob, encoding: 'base64' }).then(x => x.data) :
        fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ content: encodedBlob, encoding: 'base64' })
        }).then(x => x.json()));

      /** @type {typeof tree[0]} */
      const treeItem = {
        path: file,
        mode: /** @type {*} */(deriveMode(file, mode)),
        type: 'blob',
        sha: blob.sha
      };

      tree.push(treeItem);
      return treeItem;
    }

    /**
     * @param {string} file
     */
    async function remove(file) {

      /** @type {typeof tree[0]} */
      const treeItem = {
        path: file,
        mode: '100644',
        type: 'commit',
        sha: null
      };

      tree.push(treeItem);

      return treeItem;
    }

    /**
     * @param {string} message
     */
    async function commit(message) {
      /** @type {Awaited<ReturnType<import('@octokit/rest').Octokit['rest']['git']['createTree']>>['data']} */
      const treeObj = await (octokit ?
        octokit.rest.git.createTree({ owner, repo, tree, base_tree: headCommit.tree.sha }).then(x => x.data) :
        fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ tree, base_tree: headCommit.tree.sha })
        }).then(x => x.json()));

      /** @type {Awaited<ReturnType<import('@octokit/rest').Octokit['rest']['git']['createCommit']>>['data']} */
      const commitObj = await (octokit ?
        octokit.rest.git.createCommit({ owner, repo, message, tree: treeObj.sha, parents: [headCommit.sha] }).then(x => x.data) :
        fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ message, tree: treeObj.sha, parents: [headCommit.sha] })
        }).then(x => x.json()));

      /** @type {Awaited<ReturnType<import('@octokit/rest').Octokit['rest']['git']['updateRef']>>['data']} */
      const updatedRef = await (octokit ?
        octokit.rest.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: commitObj.sha }) :
        fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ sha: commitObj.sha })
        }).then(x => x.json()));

      return commitObj;
    }

  }

  /**
   * @param {string} file
   * @param {string | number} mode
   */
  function deriveMode(file, mode) {
    if (!mode) return '100644';
    else if (typeof mode === 'number') return mode.toString(8);
    else return mode; // TODO: handle 'r', 'w', 'x' and 'x+' modes
  }

  /**
   * @param {string | ArrayBuffer | Uint8Array} content
   */
  function toBase64(content) {
    if (typeof content === 'string') return btoa(content);

    const arr = content instanceof Uint8Array ? content : new Uint8Array(content);
    let result = '';
    for (let i = 0; i < arr.length; i++) {
      result += String.fromCharCode(arr[i]);
    }
    return btoa(result);
  }

  function defaultFetch() {
    // can put a polyfill here
    return fetch;
  }

  /**
 * @param {Parameters<typeof fetch>[0] & { onretry?: ({}: RetryArgs) => void, corsproxy?: boolean }} req
 * @param {Parameters<typeof fetch>[1] & { onretry?: ({}: RetryArgs) => void, corsproxy?: boolean }} [init]
 * @returns {ReturnType<typeof fetch>}
 */
  async function retryFetch(req, init, ...rest) {
    const started = Date.now();
    let tryCount = 0;
    while (true) {

      try {
        let useCors = req.corsproxy ?? init?.corsproxy;
        if (typeof useCors !== 'boolean')
          useCors = tryCount && corsproxyMightBeNeeded && Math.random() > 0.5;
        const re = useCors ? await fetchWithCors(req, init) : await fetch(req, init);

        if (re.status >= 200 && re.status < 400 ||
          (re.status >= 401 && re.status <= 404)) { // success, auth error or 404 is a sign of request having been processed
          if (!useCors) corsproxyMightBeNeeded = false;
          return re;
        }

        retry(new Error('HTTP' + re.status + ' ' + re.statusText));
      } catch (e) {
        await retry(e);
      }
    }

    /** @param {Error} error */
    function retry(error) {
      tryCount++;
      let onretry = req.onretry || init?.onretry;

      const now = Date.now();
      let waitFor = Math.min(
        30000,
        Math.max(300, (now - started) / 3)
      ) * (0.7 + Math.random() * 0.6);

      if (typeof onretry === 'function') {
        const args = { error, started, tryCount, waitUntil: now + waitFor };
        onretry(args);

        // allow adjusting the timeout from onretry callback
        if (args.waitUntil >= now)
          waitFor = args.waitUntil - now;
      }

      console.warn(
        tryCount + ' error' + (tryCount > 1 ? 's' : '') +
        ', retry in ', waitFor, 'ms ',
        req,
        error);

      return new Promise(resolve => setTimeout(resolve, waitFor));
    }
  }


  if (!window['Buffer']) {
    window['Buffer'] = { from: btoa.bind(window) };
  }

  let pauseUpdatesPromise;

  const letters = '234567abcdefghjiklmnopqrstuvwxyz';

  const statusBar = /** @type {HTMLElement} */(document.querySelector('.status-content'));
  const payload = /** @type {HTMLElement} */(document.querySelector('.payload'));
  const githubAuthTokenInput = /** @type {HTMLInputElement} */(document.querySelector('.github-auth-token'));
  const githubCommitButton = /** @type {HTMLButtonElement} */(document.querySelector('.github-commit'));
  const githubCommitStatus = /** @type {HTMLElement} */(document.querySelector('.github-commit-status'));

  const loadReadme = new Promise(resolve => {
    /** @param {string} txt */
    window.md = function (txt) {
      const posHash = txt.indexOf('#');
      const posComment = txt.lastIndexOf('<' + '!');
      const stripped = txt.slice(posHash + 1, posComment);
      resolve(stripped);
    };
  });

  load();

} coldskyDIDs();
