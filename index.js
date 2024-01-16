// @ts-check

async function coldskyDIDs() {
  if (!window['Buffer']) {
    window['Buffer'] = { from: btoa.bind(window) };
  }

  /** @type {import('./libs')} */
  const coldsky = window['coldsky'];
  const { isPromise, ColdskyAgent, shortenDID } = coldsky;

  let pauseUpdatesPromise;

  const letters = '234567abcdefghjiklmnopqrstuvwxyz';

  const statusBar = /** @type {HTMLElement} */(document.querySelector('.status-content'));
  const payload = /** @type {HTMLElement} */(document.querySelector('.payload'));
  const githubAuthTokenInput = /** @type {HTMLInputElement} */(document.querySelector('.github-auth-token'));
  const githubCommitButton = /** @type {HTMLButtonElement} */(document.querySelector('.github-commit'));
  const githubCommitStatus = /** @type {HTMLElement} */(document.querySelector('.github-commit-status'));

  await load();

  async function load() {
    statusBar.textContent = 'Detecting cursors...';

    /** @type {import('./cursors.json')} */
    const cursors = await fetch(relativeURL('cursors.json')).then(x => x.json());
    let reflectCursor = cursors.listRepos.cursor;

    statusBar.textContent = 'Hydrating...';

    payload.className = 'payload payload-show';

    const matrixElement = /** @type {HTMLElement} */(document.querySelector('.matrix'));
    const bucketsAndElements = createBucketElements(matrixElement);
    const gitAuthPanel = /** @type {HTMLElement} */(document.querySelector('.git-auth-panel'));

    const knownDidsTitleNumberElement = /** @type {HTMLElement} */(document.querySelector('.dids-title-number'));
    const newDidsTitleNumberElement = /** @type {HTMLElement} */(document.querySelector('.new-dids-title-number'));
    const newDidsTitleExtraElement = /** @type {HTMLElement} */(document.querySelector('.new-dids-title-extra'));
    const totalDidsTitleNumberElement = /** @type {HTMLElement} */(document.querySelector('.total-dids-title-number'));

    let allBucketsLoaded = false;
    let allNewAccountsLoaded = false;

    const loadAllBuckets = [];
    for (const twoLetterKey in bucketsAndElements) {
      const entry = bucketsAndElements[twoLetterKey];
      if (isPromise(entry.bucket.originalShortDIDs)) {
        loadAllBuckets.push(entry.bucket.originalShortDIDs.then(() => {
          updateBucketElement(entry.bucket, entry.element);
          updateTitlesWithTotal();
        }));
      }
    }
    Promise.all(loadAllBuckets).then(() => {
      allBucketsLoaded = true;
    });

    const loadNewAccountsPromise = loadAndApplyNewAccounts();
    loadNewAccountsPromise.then(() => {
      allNewAccountsLoaded = true;
    });

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

          const octokit = new Octokit({ auth: authToken });
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

    /**
     * @param {BucketData} bucket
     * @param {HTMLElement} bucketElement
     * @param {number=} newDidCount
     */
    async function updateBucketElement(bucket, bucketElement, newDidCount) {
      let className;
      if (isPromise(bucket.originalShortDIDs)) {
        className = bucket.bucketFetchError ? 'matrix-element error-bucket' :
          (
            bucket.randomAlt ? 'matrix-element loading loading-alt' : 'matrix-element loading'
          );
      } else {
        if (bucket.newShortDIDs?.size) className = (newDidCount ? 'matrix-element loaded new-dids fresh' : 'matrix-element loaded new-dids');
        else className = 'matrix-element loaded';
      }

      if (bucketElement.className !== className) bucketElement.className = className;
    }

    function updateTitlesWithError() {
      updateTitlesWithTotal(true)
    }

    function getTotals() {
      let totalKnownDids = 0;
      let newDids = 0;
      for (const twoLetterKey in bucketsAndElements) {
        const { bucket } = bucketsAndElements[twoLetterKey];
        if (!isPromise(bucket.originalShortDIDs)) {
          totalKnownDids += bucket.originalShortDIDs.size;
          newDids += bucket.newShortDIDs?.size || 0;
        }
      }

      return { totalKnownDids, newDids };
    }

    function updateTitlesWithTotal(hasError) {
      const { totalKnownDids, newDids } = getTotals();

      knownDidsTitleNumberElement.textContent = totalKnownDids.toLocaleString();
      newDidsTitleNumberElement.textContent = newDids.toLocaleString();
      totalDidsTitleNumberElement.textContent = (totalKnownDids + newDids).toLocaleString();

      const reflectCursorText = Number.isFinite(Number(reflectCursor)) ? Number(reflectCursor).toLocaleString() : reflectCursor;
      newDidsTitleExtraElement.textContent = hasError ? 'cursor: ' + reflectCursorText + ' (with errors)' : 'cursor: ' + reflectCursorText;

      if (newDids) {
        // and all buckets are populated
        if (githubCommitButton.disabled) {
          githubCommitButton.disabled = false;
          statusBar.textContent = 'Pumping new accounts...';
        }

        githubCommitButton.onclick = tryCommit;
      }
    }

    async function loadAndApplyNewAccounts() {
      for await (const entry of loadShortDIDs(cursors.listRepos.cursor)) {
        await pauseUpdatesPromise;
        if (entry.error) {
          updateTitlesWithError();
          continue;
        }

        reflectCursor = entry.cursor;
        const expandedBuckets = new Map();

        for (const shortDID of entry.shortDIDs) {
          const twoLetterKey = getTwoLetterKey(shortDID);
          const entry = bucketsAndElements[twoLetterKey];
          if (entry.bucket.addNewShortDID(shortDID)) {
            const expandedBucketCount = expandedBuckets.get(twoLetterKey);
            if (!expandedBucketCount) expandedBuckets.set(twoLetterKey, 1);
            else expandedBuckets.set(twoLetterKey, expandedBucketCount + 1);
          }
        }

        for (const twoLetterKey of expandedBuckets.keys()) {
          const entry = bucketsAndElements[twoLetterKey];
          updateBucketElement(entry.bucket, entry.element, expandedBuckets.get(twoLetterKey));
        }

        for (const twoLetterKey in bucketsAndElements) {
          const entry = bucketsAndElements[twoLetterKey];
          if (expandedBuckets.has(twoLetterKey)) continue;
          updateBucketElement(entry.bucket, entry.element);
        }

        updateTitlesWithTotal();
      }

      statusBar.textContent = 'All accounts loaded.';
    }
  }

  /** @param {HTMLElement} matrixElement */
  function createBucketElements(matrixElement) {
    /** @type {{ [twoLetterKey: string]: { bucket: BucketData, element: HTMLElement } }} */
    const bucketsAndElements = {};

    const webBucket = createBucket('web');
    const webBucketElement = document.createElement('div');
    webBucketElement.className = 'matrix-element';
    webBucketElement.style.gridColumn = '1';
    webBucketElement.style.gridRow = String(letters.length);
    matrixElement.appendChild(webBucketElement);

    bucketsAndElements['web'] = {
      bucket: webBucket,
      element: webBucketElement
    };

    for (let iFirstLetter = 0; iFirstLetter < letters.length; iFirstLetter++) {
      for (let iSecondLetter = 0; iSecondLetter < letters.length; iSecondLetter++) {
        const twoLetterKey = letters[iFirstLetter] + letters[iSecondLetter];
        const bucket = createBucket(twoLetterKey);

        const element = document.createElement('div');
        element.className = bucket.randomAlt ? 'matrix-element matrix-element-alt' : 'matrix-element';
        element.style.gridColumn = String(iFirstLetter + 2);
        element.style.gridRow = String(iSecondLetter + 1);
        matrixElement.appendChild(element);

        bucketsAndElements[twoLetterKey] = {
          bucket,
          element
        };
      }
    }

    return bucketsAndElements;
  }

  /**
   * @param {string} originalCursor
   */
  async function* loadShortDIDs(originalCursor) {
    let cursor = originalCursor;

    let lastStart = Date.now();
    let fetchErrorStart;

    /** @type {import('@atproto/api').BskyAgent} */
    const atClient =
      // @ts-ignore
      new ColdskyAgent();

    while (true) {
      try {
        const resp = await atClient.com.atproto.sync.listRepos({ cursor, limit: 995 });
        await pauseUpdatesPromise;
        fetchErrorStart = undefined;
        lastStart = Date.now();

        let canContinue = false;
        if (resp?.data?.cursor) {
          cursor = resp.data.cursor;
          canContinue = true;
        }

        if (resp?.data?.repos?.length) {
          /** @type {string[]} */
          const shortDIDs = resp.data.repos.map(repo => shortenDID(repo.did));
          yield {
            shortDIDs,
            originalCursor,
            cursor,
            error: undefined
          };
        }

        if (!canContinue) break;
      } catch (error) {
        if (!fetchErrorStart)
          fetchErrorStart = Date.now();

        const waitFor = Math.min(
          45000,
          Math.max(300, (Date.now() - lastStart) / 3)
        ) * (0.7 + Math.random() * 0.6);
        console.warn('delay ', waitFor, 'ms ', error);

        yield {
          shortDIDs: undefined,
          originalCursor,
          cursor,
          /** @type {Error} */
          error,
          errorStart: fetchErrorStart,
          retryAt: Date.now() + waitFor
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
   *  bucketFetchError: Error | undefined;
   *  addNewShortDID(shortDID: string): boolean;
   * }} BucketData
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
      bucketFetchError: undefined,
      addNewShortDID
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
            bucket.bucketFetchError = undefined;
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
          if (!errorReported) {
            errorReported = true;
            bucket.bucketFetchError = error;
          }

          const waitFor = Math.min(
            30000,
            Math.max(300, (Date.now() - start) / 3)
          ) * (0.7 + Math.random() * 0.6);
          console.warn('delay ', waitFor, 'ms ', error);

          await new Promise(resolve => setTimeout(resolve, waitFor));
        }
      }
    }

    /** @param {string} shortDID */
    function addNewShortDID(shortDID) {
      if (!isPromise(bucket.originalShortDIDs) && bucket.originalShortDIDs.has(shortDID))
        return false;
      if (bucket.newShortDIDs && bucket.newShortDIDs.has(shortDID))
        return false;
      if (!bucket.newShortDIDs) bucket.newShortDIDs = new Set();
      bucket.newShortDIDs.add(shortDID);
      return true;
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

  /** @param {string} url */
  function relativeURL(url) {
    return /http/i.test(location.protocol || '') ? url : 'https://dids.colds.ky/' + url;
  }

} coldskyDIDs();