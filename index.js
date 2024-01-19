// @ts-check

async function coldskyDIDs() {

  async function load() {
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

    await pumpUpdates();

    function tryCommit() {
      pauseUpdatesPromise = (async () => {
        githubCommitStatus.textContent = '';
        statusBar.textContent = 'Authenticating...';
        try {
          githubCommitButton.disabled = true;
          gitAuthPanel.classList.add('github-commit-in-progress');

          const authToken = githubAuthTokenInput.value;
          if (!authToken) {
            throw new Error('Please provide a GitHub personal access token');
          }

          const octokit =
            // @ts-ignore
            new Octokit({ auth: authToken });
          const user = await octokit.rest.users.getAuthenticated();
          console.log('auth user: ', user);

          const commitResponse = await octokit.rest.repos.getCommit({
            owner: 'colds-ky',
            repo: 'dids',
            ref: 'main'
          });
          console.log('commit: ', commitResponse);

          githubCommitStatus.textContent = 'Preparing files...';

          const changeFiles = {};

          // seed cursors with latest
          changeFiles['cursors.json'] = JSON.stringify({
            ...cursors,
            listRepos: {
              cursor: reflectCursor,
              timestamp: new Date().toISOString(),
              client:
                (navigator.platform ?
                  'web/' + (navigator.platform.replace(/win32/i, 'win')) :
                  'web') + ' ' +
                (!navigator.userAgent ? '' :
                  ' ' +
                  (/mobile/i.test(navigator.userAgent) ? 'mobile ' : '') +
                  navigator.userAgent.trim().split(/\s+/g).slice(-1)[0]) +
                (commitResponse?.data?.sha ? ' git:?' :
                  ' git:' + commitResponse?.data?.sha?.slice(0, 7))
            }
          }, null, 2);

          let totalFiles = 0;
          let incrementChars = 0;
          let totalChars = 0;
          for (const twoLetterKey in bucketsAndElements) {
            const entry = bucketsAndElements[twoLetterKey];
            if (!entry.bucket.originalJSONText || !entry.bucket.newShortDIDs?.size) {
              console.log('JSON text is not retrieved: ' + twoLetterKey);
              continue;
            }

            const lead = entry.bucket.originalJSONText.replace(/\s*\]\s*$/, '');
            const incrementJSON = packDidsJson([...entry.bucket.newShortDIDs], ',\n', '\n]\n');
            const path = getShardBucketPath(twoLetterKey);
            changeFiles[path] = lead + incrementJSON;

            incrementChars += incrementJSON.length;
            totalFiles++;
            totalChars += lead.length + incrementJSON.length;
          }

          githubCommitStatus.textContent =
            'Commit ' + totalFiles + ' files,' +
            ' +' + incrementChars.toLocaleString() + 'ch ' +
            totalChars.toLocaleString() + ' total...';

          console.log('changeFiles: ', changeFiles);

          const { totalKnownDids, newDids } = getTotals();

          const commitMessage =
            '+' + newDids.toLocaleString() + ' to ' + totalKnownDids.toLocaleString() + ' dids';

          await octokit.createOrUpdateFiles({
            owner: 'colds-ky',
            repo: 'dids',
            branch: 'main',
            changes: [
              {
                message: commitMessage,
                files: changeFiles
              }
            ],
          });

          const completeLabel = document.createElement('div');
          completeLabel.className = 'complete-label';
          completeLabel.textContent = 'Complete.';
          githubCommitStatus.appendChild(completeLabel);
          githubCommitStatus.textContent = 'Committed new accounts.';

        } catch (error) {
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

      for (const renderer of Object.values(rendererByTwoLetterKey)) {
        matrixElement.appendChild(renderer.element);
      }

      return updateBuckets;

      /** @param {{ has(twoLetterKey: string): boolean  }} [recentBuckets] */
      function updateBuckets(recentBuckets) {
        for (const renderer of Object.values(rendererByTwoLetterKey)) {
          const recent = !!recentBuckets?.has(renderer.bucket.twoLetterKey);
          renderer.update(recent);
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
        this.update(false);
        rendererByTwoLetterKey[twoLetterKey] = this;
      }

      /**
       * @this {BucketRenderer}
       * @param {boolean} recentUpdates
       */
      function updateBucket(recentUpdates) {
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
    while (true) {
      try {
        const fetchForCursor = cursor;
        const fetchURL =
          'https://corsproxy.io/?' +
          'https://bsky.network/xrpc/com.atproto.sync.listRepos?' +
          'cursor=' + fetchForCursor + '&limit=995';

        const resp = forceCycles ?
          await fetch(fetchURL, { cache: 'reload' }) :
          await fetch(fetchURL);

        await pauseUpdatesPromise;

        let data = await resp.json();
        await pauseUpdatesPromise;

        let canContinue = true;

        if (!data.cursor || !data.repos?.length) {
          if (!forceCycles) {
            forceCycles = 2;
            // retry, on the same cursor too
            continue;
          }

          // already in forceful mode, can as well give up
          canContinue = false;
        } else {
          cursor = data.cursor;
        }

        if (forceCycles) forceCycles--;

        fetchErrorStart = undefined;
        errorCount = 0;
        lastStart = Date.now();

        if (data?.repos?.length) {
          /** @type {string[]} */
          const shortDIDs = data.repos.map(repo => shortenDID(repo.did));
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

  await load();

} coldskyDIDs();