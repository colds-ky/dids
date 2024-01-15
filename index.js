// @ts-check

async function coldskyDIDs() {
  const statusBar = /** @type {HTMLElement} */(document.querySelector('.status-content'));
  const payload = /** @type {HTMLElement} */(document.querySelector('.payload'));

  await load();

  async function load() {
    statusBar.textContent = 'Detecting cursors...';

    /** @type {import('./cursors.json')} */
    const cursors = await fetch('https://dids.colds.ky/cursors.json').then(x => x.json());

    statusBar.textContent = 'Hydrating...';

    payload.className = 'payload payload-show';
    const didsPanel = /** @type {HTMLElement} */(document.querySelector('.dids-panel'));
    const shardsPanel = document.querySelector('.shards-panel');
    const gitAuthPanel = document.querySelector('.git-auth-panel');

    loadDIDs(cursors, didsPanel);
    loadShards(cursors, shardsPanel);
  }

  /**
   * @param {import('./cursors.json')} cursors
   * @param {HTMLElement} didsPanel
   */
  async function loadDIDs(cursors, didsPanel) {
    const didsMiniTitle = document.createElement('h3');
    didsMiniTitle.className = 'dids-mini-title';
    const didsMiniTitleMain = document.createElement('span');
    didsMiniTitleMain.textContent = 'New accounts';
    didsMiniTitle.appendChild(didsMiniTitleMain);
    const didsMiniTitleErrors = document.createElement('span');
    didsMiniTitleErrors.className = 'dids-mini-title-errors';
    didsMiniTitle.appendChild(didsMiniTitleErrors);
    didsPanel.appendChild(didsMiniTitle);

    /** @type {import('@atproto/api').BskyAgent} */
    const atClient =
      // @ts-ignore
      new ColdskyClient();
    
    let blocks = 0;
    let allDids = [];
    let errors = 0;

    let cursor = cursors.listRepos.cursor;
    let lastStart = Date.now();
    let fetchError = false;

    while (true) {
      try {
        const resp = await atClient.com.atproto.sync.listRepos({ cursor });
        fetchError = false;

        blocks++;
        if (resp?.data?.repos?.length) {
          for (const r of resp.data.repos) {
            allDids.push(r.did);
          }
        }

        updateTitle();

        if (!resp.data.cursor) break;
      } catch (error) {
        errors++;
        fetchError = true;

        const waitFor = Math.max(
          45000,
          Math.min(300, (Date.now() - lastStart) / 3)
        ) * (0.7 + Math.random() * 0.6);

        updateTitle();

        await new Promise(resolve => setTimeout(resolve, waitFor));
      }
    }

    return allDids;

    function updateTitle() {
      didsMiniTitleMain.textContent =
        allDids.length ? allDids.length.toLocaleString() + ' new accounts' :
        'New accounts';

      didsMiniTitleErrors.textContent =
        !errors ? '' :
         ' ' + errors.toLocaleString() + ' repo errors';

      didsMiniTitleErrors.className =
        fetchError ? 'dids-mini-title-errors dids-mini-title-errors-current' :
        'dids-mini-title-errors';

    }
  }

  async function loadShards(cursors, shardsPanel) {
    const letters = '234567abcdefghjiklmnopqrstuvwxyz';

    const miniTitle = document.createElement('h3');
    miniTitle.className = 'mini-title';
    const miniTitleMain = document.createElement('span');
    miniTitleMain.textContent = 'Shards';
    miniTitle.appendChild(miniTitleMain);
    const miniTitleTotal = document.createElement('span');
    miniTitleTotal.className = 'mini-title-total';
    miniTitle.appendChild(miniTitleTotal);

    shardsPanel.appendChild(miniTitle);

    const matrix = document.createElement('div');
    matrix.className = 'matrix';

    const matrixElements = {};
    const matrixPromises = {};
    let successCount = 0;
    let errorCount = 0;
    let didCount = 0;
    for (let iFirstLetter = 0; iFirstLetter < letters.length; iFirstLetter++) {
      const firstLetter = letters[iFirstLetter];
      for (let iSecondLetter = 0; iSecondLetter < letters.length; iSecondLetter++) {
        const secondLetter = letters[iSecondLetter];
        const key = firstLetter + secondLetter;
        const element = document.createElement('div');
        element.className = 'matrix-element rnd-' + (Math.random() > 0.5 ? '1' : '2');;
        element.style.gridColumn = String(iFirstLetter + 1);
        element.style.gridRow = String(iSecondLetter + 1);
        matrixElements[key] = element;
        matrix.appendChild(element);

        matrixPromises[key] = loadShard(element, key);
      }
    }

    shardsPanel.appendChild(matrix);

    await Promise.all(Object.values(matrixPromises));

    const matrixShards = {};
    for (const key of Object.keys(matrixPromises)) {
      matrixShards[key] = await matrixPromises[key];
    }

    function updateTitle() {
      miniTitleMain.textContent =
        successCount ?
        (
          successCount.toLocaleString() + ' shards' +
          (errorCount ? ', ' + errorCount.toLocaleString() + ' retry' : '')
        ) :
          errorCount ? 'Shards: ' + errorCount.toLocaleString() + ' retry' : 'Shards';
      if (didCount) {
        miniTitleTotal.textContent = ' ' + didCount.toLocaleString() + ' DIDs';
      }
    }

    async function loadShard(matrixElement, shardKey) {
      const baseClass = matrixElement.className;

      const start = Date.now();
      let errorReported = false;

      while (true) {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 600));
        matrixElement.className = baseClass + ' loading';
        try {
          const shardURL =
            (/http/i.test(location.pathname) ? '' : 'https://dids.colds.ky/') +
            shardKey[0] + '/' + shardKey + '.json';

          const shardData = await fetch(shardURL).then(x => x.json());
          matrixElement.className = baseClass + ' loaded';
          if (errorReported) errorCount--;
          successCount++;
          didCount += Object.keys(shardData).length;
          updateTitle();
          return shardData;
        } catch (error) {
          if (!errorReported) {
            errorCount++;
            errorReported = true;
            updateTitle();
          }

          matrixElement.className = baseClass + ' error';
          const waitFor = Math.max(
            30000,
            Math.min(300, (Date.now() - start) / 3)
          ) * (0.7 + Math.random() * 0.6);

          await new Promise(resolve => setTimeout(resolve, waitFor));
        }
      }
    }
  }

} coldskyDIDs();