// @ts-check

async function coldskyDIDs() {

  /** @type {import('./libs')} */
  const coldsky = window['coldsky'];
  const { isPromise, ColdskyAgent, shortenDID } = coldsky;

  const letters = '234567abcdefghjiklmnopqrstuvwxyz';

  const statusBar = /** @type {HTMLElement} */(document.querySelector('.status-content'));
  const payload = /** @type {HTMLElement} */(document.querySelector('.payload'));
  const githubAuthTokenInput = /** @type {HTMLInputElement} */(document.querySelector('.github-auth-token'));
  const githubCommitButton = /** @type {HTMLButtonElement} */(document.querySelector('.github-commit'));

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
    const gitAuthPanel = document.querySelector('.git-auth-panel');

    const knownDidsTitleNumberElement = /** @type {HTMLElement} */(document.querySelector('.dids-title-number'));
    const newDidsTitleNumberElement = /** @type {HTMLElement} */(document.querySelector('.new-dids-title-number'));
    const newDidsTitleExtraElement = /** @type {HTMLElement} */(document.querySelector('.new-dids-title-extra'));
    const totalDidsTitleNumberElement = /** @type {HTMLElement} */(document.querySelector('.total-dids-title-number'));

    for (const twoLetterKey in bucketsAndElements) {
      const entry = bucketsAndElements[twoLetterKey];
      if (isPromise(entry.bucket.originalShortDIDs)) {
        entry.bucket.originalShortDIDs.then(() => {
          updateBucketElement(entry.bucket, entry.element);
          updateTitlesWithTotal();
        });
      }
    }

    loadAndApplyNewAccounts();

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

    function updateTitlesWithTotal(hasError) {
      let totalKnownDids = 0;
      let newDids = 0;
      for (const twoLetterKey in bucketsAndElements) {
        const { bucket } = bucketsAndElements[twoLetterKey];
        if (!isPromise(bucket.originalShortDIDs)) {
          totalKnownDids += bucket.originalShortDIDs.size;
          newDids += bucket.newShortDIDs?.size || 0;
        }
      }

      knownDidsTitleNumberElement.textContent = totalKnownDids.toLocaleString();
      newDidsTitleNumberElement.textContent = newDids.toLocaleString();
      totalDidsTitleNumberElement.textContent = (totalKnownDids + newDids).toLocaleString();

      const reflectCursorText = Number.isFinite(Number(reflectCursor)) ? Number(reflectCursor).toLocaleString() : reflectCursor;
      newDidsTitleExtraElement.textContent = hasError ? 'cursor: ' + reflectCursorText + ' (with errors)' : 'cursor: ' + reflectCursorText;

      if (newDids) {
        // and all buckets are populated
        githubCommitButton.disabled = false;
      }
    }

    async function loadAndApplyNewAccounts() {
      for await (const entry of loadShortDIDs(cursors.listRepos.cursor)) {
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
    let fetchError = false;

    /** @type {import('@atproto/api').BskyAgent} */
    const atClient =
      // @ts-ignore
      new ColdskyAgent();

    while (true) {
      try {
        const resp = await atClient.com.atproto.sync.listRepos({ cursor, limit: 995 });
        fetchError = false;
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
        fetchError = true;

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
          error
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
          const shardData = await fetch(shardURL).then(x => x.json());
          if (errorReported)
            bucket.bucketFetchError = undefined;
          bucket.originalShortDIDs = new Set(shardData);

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