import { dataManager } from './dataManager.js';

const uiManager = {
                elements: {},
                quillInstance: null, currentMemoId: null, currentFolderId: null, saveTimeout: null, pendingSaveForMemoId: null, isSearching: false, contextMenuTarget: null, copiedItem: null, currentTab: 'pinned', selectedImportFile: null,
                init(quill) {
                    this.quillInstance = quill;
                    this.cacheElements();
                    this.currentFolderId = dataManager.getActiveFolderId();
                    this.addEventListeners();
                    this.loadDirectoryHandle(); // フォルダハンドルを読み込む
                    this.loadInitialMemo();
                    this.loadDarkMode();
                    this.render();
                    
                    document.addEventListener('visibilitychange', () => {
                        if (document.visibilityState === 'hidden') {
                            this.flushPendingSave();
                        }
                    });
                    
                    window.addEventListener('beforeunload', () => {
                        this.flushPendingSave();
                    });
                },
                
                cacheElements() {
                    this.elements = {
                        titleInput: document.querySelector('.editor-title-input'),
                        trashBtn: document.querySelector('#trash-btn'),
                        searchInput: document.querySelector('.app-sidebar__search-input'),
                        unifiedTreeContainer: document.querySelector('#unified-tree-container'),
                        contextMenu: document.querySelector('#context-menu'),
                        trashModalOverlay: document.querySelector('#trash-modal-overlay'),
                        trashListContainer: document.querySelector('#trash-list-container'),
                        trashModalCloseBtn: document.querySelector('#trash-modal-overlay .modal-close-btn'),
                        emptyTrashBtn: document.querySelector('#empty-trash-btn'),
                        exportBtn: document.querySelector('#export-btn'),
                        importInput: document.querySelector('#import-input'),
                        settingsBtn: document.querySelector('#settings-btn'),
                        settingsModalOverlay: document.querySelector('#settings-modal-overlay'),
                        settingsModalCloseBtn: document.querySelector('#settings-modal-overlay .modal-close-btn'),
                        editorFooter: document.querySelector('#editor-footer'),
                        customDialogOverlay: document.querySelector('#custom-dialog-overlay'),
                        dialogTitle: document.querySelector('#dialog-title'),
                        dialogMessage: document.querySelector('#dialog-message'),
                        dialogInput: document.querySelector('#dialog-input'),
                        dialogOkBtn: document.querySelector('#dialog-ok-btn'),
                        dialogCancelBtn: document.querySelector('#dialog-cancel-btn'),
                        darkModeToggle: document.querySelector('#dark-mode-toggle'),
                        syncWarningContainer: document.querySelector('#sync-warning-container'),
                        createNewMemoBtn: document.querySelector('#create-new-memo-btn'),
                        toggleAllBtn: document.querySelector('#toggle-all-btn'),
                        dropZone: document.querySelector('#drop-zone'),
                        fileSyncStatus: document.querySelector('#file-sync-status'),
                        tabContainer: document.querySelector('.tab-container'),
                        importConfirmationArea: document.querySelector('#import-confirmation-area'),
                        selectedImportFilename: document.querySelector('#selected-import-filename'),
                        executeImportBtn: document.querySelector('#execute-import-btn'),
                    };
                },
                updateSyncWarningIcon() {
                    const isSyncEnabled = this.directoryHandle && this.permissionGranted;
                    this.elements.syncWarningContainer.style.display = isSyncEnabled ? 'none' : 'inline-flex';
                },
                handleTyping() {
                    this.scheduleSave();
                },
                scheduleSave() {
                    dataManager.scheduleSave(() => {
                        this.saveCurrentMemo();
                    });
                },
                flushPendingSave() {
                    dataManager.flushPendingSave(() => {
                        this.saveCurrentMemo();
                    });
                },
                showCustomDialog(title, message, type = 'confirm', defaultValue = '', callback = null) {
                    this.elements.dialogTitle.textContent = title;
                    this.elements.dialogMessage.textContent = message;
                    
                    if (type === 'prompt') {
                        this.elements.dialogInput.style.display = 'block';
                        this.elements.dialogInput.value = defaultValue;
                    } else {
                        this.elements.dialogInput.style.display = 'none';
                    }
                    
                    this.elements.customDialogOverlay.classList.add('visible');

                    if (type === 'prompt') {
                        setTimeout(() => this.elements.dialogInput.focus(), 0);
                    }
                    
                    const enterHandler = (e) => {
                        if (e.key === 'Enter') {
                            onOk();
                        }
                    };

                    const handleResponse = (confirmed) => {
                        this.elements.customDialogOverlay.classList.remove('visible');
                        document.removeEventListener('keydown', enterHandler); // ここで必ずリスナーを削除
                        if (callback) {
                            if (type === 'prompt') {
                                if (confirmed) {
                                    const inputValue = this.elements.dialogInput.value;
                                    callback(inputValue);
                                } else {
                                    callback(null); // キャンセル時はnullを返す
                                }
                            } else {
                                callback(confirmed);
                            }
                        }
                    };
                    
                    const onOk = () => handleResponse(true);
                    const onCancel = () => handleResponse(false);
                    
                    // 既存のイベントリスナーを削除
                    this.elements.dialogOkBtn.replaceWith(this.elements.dialogOkBtn.cloneNode(true));
                    this.elements.dialogCancelBtn.replaceWith(this.elements.dialogCancelBtn.cloneNode(true));
                    
                    // 新しい参照を取得
                    this.elements.dialogOkBtn = document.querySelector('#dialog-ok-btn');
                    this.elements.dialogCancelBtn = document.querySelector('#dialog-cancel-btn');
                    
                    this.elements.dialogOkBtn.addEventListener('click', onOk);
                    this.elements.dialogCancelBtn.addEventListener('click', onCancel);
                    
                    // Enterキーでの確定対応
                    document.addEventListener('keydown', enterHandler);
                },
                addEventListeners() {
                    this.elements.titleInput.addEventListener('keyup', () => this.handleTyping());
                    this.elements.titleInput.addEventListener('input', () => this.handleTyping());
                    this.elements.titleInput.addEventListener('blur', () => this.flushPendingSave());
                    this.quillInstance.on('text-change', () => { this.handleTyping(); });
                    this.quillInstance.on('selection-change', (range) => {
                        if (range == null) this.flushPendingSave();
                    });
                    this.elements.unifiedTreeContainer.addEventListener('click', (e) => { this.flushPendingSave(); this.handleTreeClick(e); });
                    this.elements.unifiedTreeContainer.addEventListener('contextmenu', (e) => {
                        if (e.target.closest('.tree-item')) {
                            this.handleTreeContextMenu(e);
                        } else if (e.target === this.elements.unifiedTreeContainer) {
                            // ピン留めタブではルートコンテキストメニューを表示しない
                            if (this.currentTab === 'pinned') {
                                e.preventDefault();
                                return;
                            }
                            e.preventDefault();
                            this.showRootContextMenu(e.clientX, e.clientY);
                        }
                    });
                    this.elements.searchInput.addEventListener('input', (e) => this.handleSearch(e));
                    this.elements.trashBtn.addEventListener('click', () => this.showTrashModal());
                    this.elements.trashModalCloseBtn.addEventListener('click', () => this.hideTrashModal());
                    this.elements.trashModalOverlay.addEventListener('click', (e) => { if(e.target === this.elements.trashModalOverlay) this.hideTrashModal(); });
                    this.elements.trashListContainer.addEventListener('click', (e) => this.handleTrashAction(e));
                    this.elements.emptyTrashBtn.addEventListener('click', () => this.handleEmptyTrash());
                    this.elements.exportBtn.addEventListener('click', () => dataManager.exportData());
                    this.elements.importInput.addEventListener('change', (e) => this.handleImport(e));
                    this.elements.executeImportBtn.addEventListener('click', () => this.handleExecuteImport());
                    
                    this.elements.settingsBtn.addEventListener('click', () => this.showSettingsModal());
                    this.elements.settingsModalCloseBtn.addEventListener('click', () => this.hideSettingsModal());
                    this.elements.settingsModalOverlay.addEventListener('click', (e) => { if(e.target === this.elements.settingsModalOverlay) this.hideSettingsModal(); });
                    
                    // 設定モーダル内のボタン
                    document.addEventListener('click', (e) => {
                        if (e.target.id === 'export-btn-settings') {
                            dataManager.exportData();
                        }
                    });
                    
                    document.addEventListener('change', (e) => {
                        if (e.target.id === 'import-input-settings') {
                            this.handleImport(e);
                        }
                    });
                    
                    this.elements.contextMenu.addEventListener('click', (e) => this.handleContextMenuClick(e));
                    document.addEventListener('click', () => this.hideContextMenu());
                    this.elements.darkModeToggle.addEventListener('click', () => this.toggleDarkMode());
                    this.elements.createNewMemoBtn.addEventListener('click', () => this.handleNewMemo());
                    this.elements.toggleAllBtn.addEventListener('click', () => {
                        if (dataManager.areAllFoldersCollapsed()) {
                            dataManager.expandAllFolders();
                            this.elements.toggleAllBtn.textContent = 'すべて閉じる';
                        } else {
                            dataManager.collapseAllFolders();
                            this.elements.toggleAllBtn.textContent = 'すべて開く';
                        }
                        this.render();
                    });

                    // Drag and Drop for Sync Directory
                    const dropZone = this.elements.dropZone;
                    dropZone.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        dropZone.classList.add('drag-over');
                    });
                    dropZone.addEventListener('dragleave', (e) => {
                        e.preventDefault();
                        dropZone.classList.remove('drag-over');
                    });
                    dropZone.addEventListener('drop', (e) => this.handleDrop(e));
                    dropZone.addEventListener('click', () => this.handleFolderSelectClick());

                    this.elements.tabContainer.addEventListener('click', (e) => {
                        if (e.target.classList.contains('tab-btn')) {
                            this.currentTab = e.target.dataset.tab;
                            this.elements.tabContainer.querySelector('.active').classList.remove('active');
                            e.target.classList.add('active');
                            this.render();
                        }
                    });

                    chrome.storage.onChanged.addListener((changes, namespace) => {
                        if (namespace === 'local' && changes[dataManager.DB_KEY]) {
                            dataManager.db = changes[dataManager.DB_KEY].newValue;
                            console.log('Storage changed by another tab. Reloading data.');
                            this.render();
                        }
                    });
                },

                updateToggleAllButton() {
                    if (dataManager.areAllFoldersCollapsed()) {
                        this.elements.toggleAllBtn.textContent = 'すべて開く';
                    } else {
                        this.elements.toggleAllBtn.textContent = 'すべて閉じる';
                    }
                },
                updateButtonStates() {
                    const isPinnedTab = this.currentTab === 'pinned';
                    this.elements.createNewMemoBtn.disabled = isPinnedTab;
                    this.elements.toggleAllBtn.disabled = isPinnedTab;
                },
                render() { console.log("//-D- render called"); this.renderUnifiedTree(); this.updateToggleAllButton(); this.updateButtonStates(); },
                renderUnifiedTree() {
                    const db = dataManager.getData();
                    let html = '';

                    if (this.currentTab === 'pinned') {
                        const pinnedMemos = db.memos.filter(memo => memo.isPinned && !memo.isTrash);
                        pinnedMemos.sort((a, b) => (a.pinnedSortOrder || 0) - (b.pinnedSortOrder || 0));
                        pinnedMemos.forEach(memo => {
                            html += this.createMemoHTML(memo, 0);
                        });
                    } else {
                        const rootMemos = this.getSortedMemos(db, null);
                        rootMemos.forEach(memo => {
                            html += this.createMemoHTML(memo, 0);
                        });
                        html += this.buildTree(db, null, 0);
                    }

                    this.elements.unifiedTreeContainer.innerHTML = html;
                },

                buildTree(db, parentId, level) {
                    if (level >= 3) return '';
                    let html = '';

                    const folders = this.getSortedFolders(db, parentId);
                    folders.forEach(folder => {
                        html += this.createFolderHTML(folder, level);
                        if (!folder.isCollapsed) {
                            const memos = this.getSortedMemos(db, folder.id);
                            memos.forEach(memo => {
                                html += this.createMemoHTML(memo, level + 1);
                            });
                            html += this.buildTree(db, folder.id, level + 1);
                        }
                    });

                    return html;
                },

                createFolderHTML(folder, level) {
                    const isCollapsed = folder.isCollapsed || false;
                    return `<div class="tree-item folder ${folder.id === this.currentFolderId ? 'active' : ''}" data-type="folder" data-id="${folder.id}" data-level="${level}">
                                <span class="folder-toggle" data-id="${folder.id}">${isCollapsed ? '+' : '-'}</span>
                                <span class="folder-emoji" data-id="${folder.id}" style="margin-right: 8px; cursor: pointer;">${isCollapsed ? '📁' : '📂'}</span>
                                <span class="folder-name" data-id="${folder.id}" data-type="folder" style="flex-grow: 1;">${dataManager.escapeHTML(folder.name)}</span>
                                <div class="sort-buttons">
                                    <button class="sort-btn" data-action="move-up" data-id="${folder.id}" data-type="folder" data-parent="${folder.parentId || 'null'}" title="上に移動">▲</button>
                                    <button class="sort-btn" data-action="move-down" data-id="${folder.id}" data-type="folder" data-parent="${folder.parentId || 'null'}" title="下に移動">▼</button>
                                </div>
                            </div>`;
                },
                createMemoHTML(memo, level) {
                    const snippet = memo.snippet || this.getContentSnippet(memo.content);
                    const pinIcon = memo.isPinned ? '📌' : '📝';
                    
                    let sortButtons = '';
                    if (this.currentTab === 'pinned') {
                        sortButtons = `
                            <div class="sort-buttons">
                                <button class="sort-btn" data-action="move-pinned-up" data-id="${memo.id}" title="上に移動">▲</button>
                                <button class="sort-btn" data-action="move-pinned-down" data-id="${memo.id}" title="下に移動">▼</button>
                            </div>`;
                    } else {
                        sortButtons = `
                            <div class="sort-buttons">
                                <button class="sort-btn" data-action="move-up" data-id="${memo.id}" data-type="memo" data-parent="${memo.folderId || 'null'}" title="上に移動">▲</button>
                                <button class="sort-btn" data-action="move-down" data-id="${memo.id}" data-type="memo" data-parent="${memo.folderId || 'null'}" title="下に移動">▼</button>
                            </div>`;
                    }

                    return `<div class="tree-item memo ${memo.id === this.currentMemoId ? 'active' : ''}" data-type="memo" data-id="${memo.id}" data-level="${level}">
                                <div style="flex-grow: 1; min-width: 0;">
                                    <div class="memo-title-line">
                                        <span class="memo-icon" data-action="toggle-pin" data-id="${memo.id}" style="cursor: pointer;">${pinIcon}</span>
                                        <span class="memo-title">${dataManager.escapeHTML(memo.title) || '無題のメモ'}</span>
                                    </div>
                                    <div class="tree-item__snippet">${snippet}</div>
                                </div>
                                ${sortButtons}
                            </div>`;
                },

                getSortedFolders(db, parentId) {
                    return db.folders
                        .filter(f => f.parentId === parentId && !f.isTrash)
                        .sort((a, b) => {
                            const orderA = a.sortOrder ?? Infinity;
                            const orderB = b.sortOrder ?? Infinity;
                            if (orderA !== orderB) {
                                return orderA - orderB;
                            }
                            return a.name.localeCompare(b.name);
                        });
                },

                getSortedMemos(db, folderId) {
                    return db.memos
                        .filter(m => m.folderId === folderId && !m.isTrash)
                        .sort((a, b) => {
                            const orderA = a.sortOrder ?? Infinity;
                            const orderB = b.sortOrder ?? Infinity;
                            if (orderA !== orderB) {
                                return orderA - orderB;
                            }
                            return new Date(b.createdAt) - new Date(a.createdAt);
                        });
                },
                renderSearchResults(results) {
                    let html = '';
                    results.forEach(m => {
                        html += `<div class="tree-item memo ${m.id === this.currentMemoId ? 'active' : ''}" data-type="memo" data-id="${m.id}" data-level="0">
                            <div>
                                <span>${dataManager.escapeHTML(m.title) || '無題のメモ'}</span>
                                <div class="tree-item__snippet">${m.snippet || ''}</div>
                            </div>
                        </div>`;
                    });
                    this.elements.unifiedTreeContainer.innerHTML = html;
                },
                getContentSnippet(content) {
                    const stripHtml = (html) => (new DOMParser().parseFromString(html, 'text/html')).body.textContent || '';
                    return dataManager.escapeHTML(stripHtml(content).substring(0, 50));
                },
                loadInitialMemo() {
                    let memoId = dataManager.getActiveMemoId();
                    const db = dataManager.getData();
                    if (!memoId || !db.memos.find(m => m.id === memoId && !m.isTrash)) {
                        const firstMemo = db.memos.find(m => !m.isTrash);
                        memoId = firstMemo ? firstMemo.id : dataManager.createMemo(this.currentFolderId).id;
                    }
                    this.loadMemo(memoId);
                },
                loadMemo(id) {
                    console.log(`//-D- loadMemo START for id: ${id}`);
                    if (this.saveTimeout) { clearTimeout(this.saveTimeout); this.saveTimeout = null; this.pendingSaveForMemoId = null; }
                    const memo = dataManager.getData().memos.find(m => m.id === id);
                    if (!memo) { console.error(`//-D- loadMemo FAILED to find memo.`); return; }
                    console.log("//-D- Memo data to be loaded: ", JSON.parse(JSON.stringify(memo)));
                    this.currentMemoId = memo.id;
                    this.elements.titleInput.value = memo.title;
                    this.quillInstance.clipboard.dangerouslyPasteHTML(memo.content, 'silent');
                    this.updateLastUpdated(memo.updatedAt);
                    dataManager.setActiveMemoId(memo.id);
                    if (this.currentFolderId !== memo.folderId) {
                        this.currentFolderId = memo.folderId;
                        dataManager.setActiveFolderId(this.currentFolderId);
                    }
                    this.render();
                    console.log("//-D- loadMemo END");
                },
                getEditorHTML() {
                    const q = this.quillInstance;
                    return (q && q.root && typeof q.root.innerHTML === 'string') ? q.root.innerHTML : '';
                },
                saveCurrentMemo() {
                    console.log("//-D- saveCurrentMemo START");
                    if (!this.currentMemoId) return;
                    const title = this.elements.titleInput.value;
                    const content = this.getEditorHTML();
                    console.log(`//-D- Data to be saved: Title=${title}, Content Length=${content.length}`);
                    const updatedMemo = dataManager.updateMemo(this.currentMemoId, { title, content });
                    if (updatedMemo) {
                        this.updateLastUpdated(updatedMemo.updatedAt);
                        // --- File System Access API でDB全体をファイルにバックアップ ---
                        if (this.directoryHandle) {
                            this.backupDatabaseToFile();
                        }
                        // -----------------------------------------------------
                    }
                    if (!this.isSearching) { this.updateMemoItemInTree(this.currentMemoId, title); }

                    console.log("//-D- saveCurrentMemo END");
                },

                async backupDatabaseToFile() {
                    if (!this.directoryHandle) return;
                    try {
                        const fileName = `memo_app_backup.json`;
                        const fileHandle = await this.directoryHandle.getFileHandle(fileName, { create: true });
                        const writable = await fileHandle.createWritable();
                        const dbData = JSON.stringify(dataManager.getData(), null, 2);
                        await writable.write(dbData);
                        await writable.close();
                        console.log(`Database backed up to ${fileName}.`);
                    } catch (error) {
                        console.error(`Failed to backup database to file.`, error);
                        this.permissionGranted = false;
                        this.updateFileSyncStatus('エラー発生');
                        this.updateSyncWarningIcon();
                    }
                },
                updateLastUpdated(isoString) {
                    if (!isoString) {
                        this.elements.editorFooter.textContent = '';
                        return;
                    }
                    const date = new Date(isoString);
                    const formattedDate = dataManager.formatDateTime(date);
                    this.elements.editorFooter.textContent = `保存済み: ${formattedDate}`;
                },
                updateMemoItemInTree(memoId, newTitle) {
                    const memoItem = this.elements.unifiedTreeContainer.querySelector(`.tree-item[data-id="${memoId}"][data-type="memo"]`);
                    if (memoItem) {
                        const titleElement = memoItem.querySelector('.memo-title');
                        if (titleElement) { titleElement.textContent = newTitle || '無題のメモ'; }
                    }
                },
                handleNewFolder() { 
                    this.showCustomDialog(
                        'フォルダ作成',
                        '新しいフォルダ名を入力してください:',
                        'prompt',
                        '',
                        (name) => {
                            if (name !== null && name !== undefined && typeof name === 'string' && name.trim()) {
                                dataManager.createFolder(name.trim(), this.currentFolderId);
                                this.render();
                            }
                        }
                    );
                },
                handleNewMemo() { const memo = dataManager.createMemo(this.currentFolderId); dataManager.openFolder(this.currentFolderId); this.loadMemo(memo.id); },
                handleTreeClick(e) {
                    // ピン留め/解除処理
                    if (e.target.dataset.action === 'toggle-pin') {
                        e.stopPropagation();
                        const id = e.target.dataset.id;
                        dataManager.togglePin(id);
                        this.render();
                        return;
                    }

                    // ピン留め済みメモの並び替え
                    if (e.target.dataset.action === 'move-pinned-up' || e.target.dataset.action === 'move-pinned-down') {
                        e.stopPropagation();
                        const id = e.target.dataset.id;
                        const direction = e.target.dataset.action === 'move-pinned-up' ? 'up' : 'down';
                        if (dataManager.movePinnedItem(id, direction)) {
                            this.loadMemo(id);
                        }
                        return;
                    }

                    // 並び替えボタンのクリック処理
                    if (e.target.classList.contains('sort-btn')) {
                        e.stopPropagation();
                        const action = e.target.dataset.action;
                        const id = e.target.dataset.id;
                        const type = e.target.dataset.type;
                        const parentId = e.target.dataset.parent === 'null' ? null : e.target.dataset.parent;
                        
                        const direction = action === 'move-up' ? 'up' : 'down';
                        const success = dataManager.moveItem(id, type, direction, parentId);
                        
                        if (success) {
                            if (type === 'memo') {
                                this.currentMemoId = id;
                                dataManager.setActiveMemoId(id);
                            } else if (type === 'folder') {
                                this.currentFolderId = id;
                                dataManager.setActiveFolderId(id);
                            }
                            this.render();
                        }
                        return;
                    }
                    
                    const item = e.target.closest('.tree-item');
                    if (item) {
                        const type = item.dataset.type;
                        const id = item.dataset.id;

                        if (type === 'folder') {
                            const rect = item.getBoundingClientRect();
                            const clickX = e.clientX;
                            const isLeftHalf = (clickX - rect.left) < (rect.width / 2);

                            if (isLeftHalf) {
                                // 左半分をクリックした場合：開閉
                                dataManager.toggleFolderCollapse(id);
                                // フォルダを選択状態にする処理を追加
                                this.isSearching = false;
                                this.elements.searchInput.value = '';
                                this.currentFolderId = id;
                                dataManager.setActiveFolderId(id);
                                this.render(); // 選択状態と開閉状態を反映するためにrenderを呼ぶ
                                return;
                            } else {
                                // 右半分をクリックした場合：選択
                                this.isSearching = false;
                                this.elements.searchInput.value = '';
                                this.currentFolderId = id;
                                dataManager.setActiveFolderId(id);
                                const db = dataManager.getData();
                                const memosInFolder = db.memos
                                    .filter(m => m.folderId === id && !m.isTrash)
                                    .sort((a, b) => {
                                        if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
                                            return a.sortOrder - b.sortOrder;
                                        }
                                        return new Date(a.createdAt) - new Date(b.createdAt);
                                    });
                                if (memosInFolder.length > 0) {
                                    this.loadMemo(memosInFolder[0].id);
                                } else {
                                    // フォルダ内にメモがない場合でも、選択状態を反映するために render() を呼ぶ
                                    this.render();
                                }
                            }
                        } else if (type === 'memo') {
                            // メモがクリックされた場合
                            this.loadMemo(id);
                        }
                    }
                },
                handleTreeContextMenu(e) {
                    e.preventDefault();
                    const target = e.target.closest('.tree-item');
                    if (target) {
                        this.contextMenuTarget = target;
                        this.showContextMenu(e.clientX, e.clientY, target.dataset.type, target.dataset.id);
                    }
                },
                showContextMenu(x, y, type, id) {
                    const menuHTML = this.createContextMenuHTML(type, id);
                    this.elements.contextMenu.innerHTML = menuHTML;
                    this.positionContextMenu(x, y);
                },
                showRootContextMenu(x, y) {
                    const menuHTML = this.createContextMenuHTML('root');
                    this.elements.contextMenu.innerHTML = menuHTML;
                    this.positionContextMenu(x, y);
                },
                createContextMenuHTML(type) {
                    let menuHTML = '';
                    if (type === 'folder') {
                        menuHTML += '<div class="context-menu-item" data-action="new-memo">新規メモ</div>';
                        menuHTML += '<div class="context-menu-item" data-action="new-folder">新規フォルダ</div>';
                        menuHTML += '<div class="context-menu-separator"></div>';
                        menuHTML += '<div class="context-menu-item" data-action="copy">コピー</div>';
                        if (this.copiedItem) {
                            menuHTML += '<div class="context-menu-item" data-action="paste">貼り付け</div>';
                        }
                        menuHTML += '<div class="context-menu-separator"></div>';
                        menuHTML += '<div class="context-menu-item" data-action="rename">名前を変更</div>';
                        menuHTML += '<div class="context-menu-separator"></div>';
                        menuHTML += '<div class="context-menu-item" data-action="delete">削除</div>';
                    } else if (type === 'memo') {
                        menuHTML += '<div class="context-menu-item" data-action="copy">コピー</div>';
                        menuHTML += '<div class="context-menu-separator"></div>';
                        menuHTML += '<div class="context-menu-item" data-action="rename">名前を変更</div>';
                        menuHTML += '<div class="context-menu-separator"></div>';
                        menuHTML += '<div class="context-menu-item" data-action="delete">削除</div>';
                    } else if (type === 'root') {
                        menuHTML += '<div class="context-menu-item" data-action="new-memo-root">新規メモ</div>';
                        menuHTML += '<div class="context-menu-item" data-action="new-folder-root">新規フォルダ</div>';
                        if (this.copiedItem) {
                            menuHTML += '<div class="context-menu-separator"></div>';
                            menuHTML += '<div class="context-menu-item" data-action="paste-root">貼り付け</div>';
                        }
                    }
                    return menuHTML;
                },
                positionContextMenu(x, y) {
                    // まず表示してサイズを取得
                    this.elements.contextMenu.style.left = '0px';
                    this.elements.contextMenu.style.top = '0px';
                    this.elements.contextMenu.style.display = 'block';
                    
                    // メニューのサイズを取得
                    const menuRect = this.elements.contextMenu.getBoundingClientRect();
                    const menuWidth = menuRect.width;
                    const menuHeight = menuRect.height;
                    
                    // 画面サイズを取得
                    const windowWidth = window.innerWidth;
                    const windowHeight = window.innerHeight;
                    
                    // 右端を超える場合は左側に表示
                    let finalX = x;
                    if (x + menuWidth > windowWidth) {
                        finalX = x - menuWidth;
                        // それでも左端を超える場合は右端に合わせる
                        if (finalX < 0) {
                            finalX = windowWidth - menuWidth;
                        }
                    }
                    
                    // 下端を超える場合は上側に表示
                    let finalY = y;
                    if (y + menuHeight > windowHeight) {
                        finalY = y - menuHeight;
                        // それでも上端を超える場合は下端に合わせる
                        if (finalY < 0) {
                            finalY = windowHeight - menuHeight;
                        }
                    }
                    
                    // 最終位置を設定
                    this.elements.contextMenu.style.left = Math.max(0, finalX) + 'px';
                    this.elements.contextMenu.style.top = Math.max(0, finalY) + 'px';
                },
                hideContextMenu() {
                    this.elements.contextMenu.style.display = 'none';
                    this.contextMenuTarget = null;
                },
                handleContextMenuClick(e) {
                    e.stopPropagation();
                    const action = e.target.dataset.action;
                    if (!action) return;
                    const target = this.contextMenuTarget;
                    this.hideContextMenu();
                    if (action === 'new-memo-root') {
                        const memo = dataManager.createMemo(null);
                        this.loadMemo(memo.id);
                        return;
                    }
                    if (action === 'new-folder-root') {
                        this.showCustomDialog(
                            'フォルダ作成',
                            '新しいフォルダ名を入力してください:',
                            'prompt',
                            '',
                            (name) => {
                                if (name !== null && name !== undefined && typeof name === 'string' && name.trim()) {
                                    dataManager.createFolder(name.trim(), null);
                                    this.render();
                                }
                            }
                        );
                        return;
                    }
                    if (action === 'paste-root') {
                        this.handlePaste(null);
                        return;
                    }
                    if (!target) return;
                    const type = target.dataset.type;
                    const id = target.dataset.id;
                    switch (action) {
                        case 'new-memo':
                            this.handleContextNewMemo(type, id);
                            break;
                        case 'new-folder':
                            this.handleContextNewFolder(type, id);
                            break;
                        case 'copy':
                            this.handleCopy(type, id);
                            break;
                        case 'paste':
                            this.handlePaste(id);
                            break;
                        case 'rename':
                            this.handleRename(type, id);
                            break;
                        case 'delete':
                            if (type === 'folder') {
                                this.handleDeleteFolder(id);
                            } else if (type === 'memo') {
                                this.handleDeleteMemo(id);
                            }
                            break;
                    }
                },
                handleCopy(type, id) {
                    this.copiedItem = dataManager.copyItem(id, type);
                    if (this.copiedItem) {
                        const itemName = type === 'folder' ? 'フォルダ' : 'メモ';
                        console.log(`${itemName}をコピーしました`);
                    }
                },
                
                handlePaste(targetFolderId) {
                    if (!this.copiedItem) return;
                    
                    const result = dataManager.pasteItem(this.copiedItem, targetFolderId);
                    if (result) {
                        const itemName = this.copiedItem.type === 'folder' ? 'フォルダ' : 'メモ';
                        console.log(`${itemName}を貼り付けました`);
                        this.render();
                        
                        if (this.copiedItem.type === 'memo') {
                            this.loadMemo(result.id);
                        }
                    }
                },
                
                handleContextNewMemo(targetType, targetId) {
                    const memo = dataManager.createMemo(targetId);
                    dataManager.openFolder(targetId);
                    this.loadMemo(memo.id);
                },
                handleContextNewFolder(targetType, targetId) {
                    this.showCustomDialog(
                        'フォルダ作成',
                        '新しいフォルダ名を入力してください:',
                        'prompt',
                        '',
                        (name) => {
                            if (name !== null && name !== undefined && typeof name === 'string' && name.trim()) {
                                dataManager.createFolder(name.trim(), targetId);
                                this.render();
                            }
                        }
                    );
                },
                handleRename(type, id) {
                    if (type === 'folder') {
                        const folder = dataManager.getData().folders.find(f => f.id === id);
                        if (folder) {
                            this.showCustomDialog(
                                'フォルダ名変更',
                                '新しいフォルダ名を入力してください:',
                                'prompt',
                                folder.name,
                                (newName) => {
                                    if (newName !== null && newName !== undefined && typeof newName === 'string' && newName.trim() && newName !== folder.name) {
                                        dataManager.renameFolder(id, newName.trim());
                                        this.render();
                                    }
                                }
                            );
                        }
                    } else if (type === 'memo') {
                        const memo = dataManager.getData().memos.find(m => m.id === id);
                        if (memo) {
                            this.showCustomDialog(
                                'メモタイトル変更',
                                '新しいメモタイトルを入力してください:',
                                'prompt',
                                memo.title,
                                (newTitle) => {
                                    if (newTitle !== null && newTitle !== undefined && typeof newTitle === 'string' && newTitle !== memo.title) {
                                        const updatedMemo = dataManager.renameMemo(id, newTitle);
                                        if (updatedMemo) {
                                            this.updateLastUpdated(updatedMemo.updatedAt);
                                        }
                                        if (id === this.currentMemoId) {
                                            this.elements.titleInput.value = newTitle;
                                        }
                                        this.render();
                                    }
                                }
                            );
                        }
                    }
                },
                handleDeleteMemo(id) {
                    this.showCustomDialog(
                        '確認',
                        'このメモをゴミ箱に移動しますか？',
                        'confirm',
                        '',
                        (confirmed) => {
                            if (confirmed) {
                                dataManager.deleteMemo(id);
                                this.render();
                            }
                        }
                    );
                },
                handleDeleteFolder(id) {
                    this.showCustomDialog(
                        '確認',
                        'このフォルダと中のすべてのコンテンツを削除しますか？',
                        'confirm',
                        '',
                        (confirmed) => {
                            if (confirmed) {
                                dataManager.deleteFolder(id);
                                if (this.currentFolderId === id) {
                                    this.currentFolderId = null;
                                    dataManager.setActiveFolderId(null);
                                }
                                this.render();
                            }
                        }
                    );
                },
                handleSearch(e) { const query = e.target.value; if (query) { this.isSearching = true; const results = dataManager.searchMemos(query); this.renderSearchResults(results); } else { this.isSearching = false; this.render(); } },
                showTrashModal() { this.renderTrashList(); this.elements.trashModalOverlay.classList.add('visible'); },
                hideTrashModal() { this.elements.trashModalOverlay.classList.remove('visible'); },
                renderTrashList() {
                    const { memos, folders } = dataManager.getTrashedItems();
                    const memosHTML = memos.map(m =>
                        `<div class="list-item" data-id="${m.id}" data-type="memo"><span class="list-item__name">${dataManager.escapeHTML(m.title)}</span><div><button class="restore-btn">復元</button><button class="delete-perm-btn">完全に削除</button></div></div>`
                    ).join('');
                    const foldersHTML = folders.map(f =>
                        `<div class="list-item" data-id="${f.id}" data-type="folder"><span class="list-item__name folder">${dataManager.escapeHTML(f.name)}</span><div><button class="restore-btn">復元</button><button class="delete-perm-btn">完全に削除</button></div></div>`
                    ).join('');
                    this.elements.trashListContainer.innerHTML = foldersHTML + memosHTML || "<p>ゴミ箱は空です。</p>";
                },
                handleTrashAction(e) {
                    const item = e.target.closest('.list-item'); if (!item) return;
                    const id = item.dataset.id; const type = item.dataset.type;
                    if (e.target.classList.contains('restore-btn')) { dataManager.restoreItem(id, type); this.renderTrashList(); this.render(); }
                    else if (e.target.classList.contains('delete-perm-btn')) {
                        this.elements.customDialogOverlay.classList.add('position-top-right');
                        this.showCustomDialog(
                            '確認',
                            'このアイテムを完全に削除しますか？\nこの操作は元に戻せません。',
                            'confirm',
                            '',
                            (confirmed) => {
                                this.elements.customDialogOverlay.classList.remove('position-top-right');
                                if (confirmed) {
                                    dataManager.deleteItemPermanently(id, type);
                                    this.renderTrashList();
                                    this.render();
                                }
                            }
                        );
                    }
                    
                },
                handleEmptyTrash() {
                    this.elements.customDialogOverlay.classList.add('position-top-right');
                    this.showCustomDialog(
                        '確認',
                        'ゴミ箱を完全に空にしますか？\nこの操作は元に戻せません。',
                        'confirm',
                        '',
                        (confirmed) => {
                            this.elements.customDialogOverlay.classList.remove('position-top-right');
                            if (confirmed) {
                                dataManager.emptyTrash();
                                this.renderTrashList();
                                this.render();
                            }
                        }
                    );
                },
                handleImport(e) {
                    const file = e.target.files[0];
                    if (!file) return;
                    
                    this.selectedImportFile = file;
                    this.elements.selectedImportFilename.textContent = file.name;
                    this.elements.importConfirmationArea.style.display = 'block';
                    
                    e.target.value = '';
                },

                handleExecuteImport() {
                    if (!this.selectedImportFile) return;

                    dataManager.importData(this.selectedImportFile, (success) => {
                        if (success) {
                            alert('インポートに成功しました！');
                            dataManager.loadDataFromStorage();
                            this.loadInitialMemo();
                        } else {
                            alert('インポートに失敗しました。ファイルの形式が正しくありません。');
                        }
                        this.elements.importConfirmationArea.style.display = 'none';
                        this.selectedImportFile = null;
                    });
                },
                showSettingsModal() { this.elements.settingsModalOverlay.classList.add('visible'); },
                hideSettingsModal() { this.elements.settingsModalOverlay.classList.remove('visible'); },

                toggleDarkMode() {
                    document.body.classList.toggle('dark-mode');
                    const isDarkMode = document.body.classList.contains('dark-mode');
                    this.elements.darkModeToggle.textContent = isDarkMode ? '🌙' : '🌞';
                    localStorage.setItem('darkMode', isDarkMode);
                },

                loadDarkMode() {
                    const isDarkMode = localStorage.getItem('darkMode') === 'true';
                    if (isDarkMode) {
                        document.body.classList.add('dark-mode');
                        this.elements.darkModeToggle.textContent = '🌙';
                    }
                },

                // --- File System Access API ---
                directoryHandle: null,
                permissionGranted: false,
                async handleFolderSelectClick() {
                    try {
                        const directoryHandle = await window.showDirectoryPicker();
                        if (directoryHandle) {
                            this.setupDirectorySync(directoryHandle);
                        }
                    } catch (error) {
                        if (error.name !== 'AbortError') {
                            console.error('Error picking directory:', error);
                            alert('フォルダの選択中にエラーが発生しました。');
                        }
                    }
                },

                async handleDrop(e) {
                    e.preventDefault();
                    this.elements.dropZone.classList.remove('drag-over');

                    // --- デバッグコード START ---
                    console.log('Drop event triggered. dataTransfer content:');
                    console.log(e.dataTransfer);
                    if (e.dataTransfer.items) {
                        console.log(`Found ${e.dataTransfer.items.length} items.`);
                        for (let i = 0; i < e.dataTransfer.items.length; i++) {
                            const item = e.dataTransfer.items[i];
                            console.log(`Item ${i}: kind=${item.kind}, type=${item.type}`);
                        }
                    }
                    if (e.dataTransfer.files) {
                        console.log(`Found ${e.dataTransfer.files.length} files.`);
                        for (let i = 0; i < e.dataTransfer.files.length; i++) {
                            const file = e.dataTransfer.files[i];
                            console.log(`File ${i}: name=${file.name}, type=${file.type}, size=${file.size}`);
                        }
                    }
                    // --- デバッグコード END ---

                    try {
                        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
                            let handle = null;
                            for (const item of e.dataTransfer.items) {
                                if (typeof item.getAsFileSystemHandle === 'function') {
                                    const potentialHandle = await item.getAsFileSystemHandle();
                                    if (potentialHandle && potentialHandle.kind === 'directory') {
                                        handle = potentialHandle;
                                        break; // フォルダが見つかったらループを抜ける
                                    }
                                }
                            }

                            if (handle) {
                                this.setupDirectorySync(handle);
                            } else {
                                alert('ドロップされたアイテムから有効なフォルダを見つけられませんでした。フォルダのみをドロップしているか確認してください。');
                                console.error('Could not find a valid directory handle in the dropped items.');
                            }
                        } else {
                             alert('ドロップされたアイテムが見つかりません。');
                        }
                    } catch (error) {
                        console.error('Error handling drop event:', error);
                        alert('エラーが発生しました。コンソールを確認してください。');
                    }
                },

                async setupDirectorySync(handle) {
                    try {
                        const options = { mode: 'readwrite' };
                        if (await handle.requestPermission(options) === 'granted') {
                            this.directoryHandle = handle;
                            this.permissionGranted = true;
                            await dataManager.setHandle('directoryHandle', handle);
                            this.updateFileSyncStatus(handle.name);
                        } else {
                            this.permissionGranted = false;
                            this.updateFileSyncStatus(null);
                            console.error('Permission to write to the directory was denied.');
                            alert('フォルダへの書き込み権限が拒否されました。');
                        }
                    } catch (error) {
                        this.permissionGranted = false;
                        this.updateFileSyncStatus(null);
                        console.error('Directory setup failed.', error);
                        alert('フォルダの設定に失敗しました。');
                    }
                    this.updateSyncWarningIcon();
                },

                async verifyPermission(handle) {
                    const options = { mode: 'readwrite' };
                    if (await handle.queryPermission(options) === 'granted') {
                        return true;
                    }
                    return false;
                },

                async loadDirectoryHandle() {
                    try {
                        const handle = await dataManager.getHandle('directoryHandle');
                        if (handle) {
                            if (await this.verifyPermission(handle)) {
                                this.directoryHandle = handle;
                                this.permissionGranted = true;
                                this.updateFileSyncStatus(handle.name);
                            } else {
                                this.permissionGranted = false;
                                this.updateFileSyncStatus(handle.name + ' (クリックして再許可)');
                                this.elements.fileSyncStatus.style.cursor = 'pointer';
                                this.elements.fileSyncStatus.addEventListener('click', async () => {
                                    try {
                                        const options = { mode: 'readwrite' };
                                        if (await handle.requestPermission(options) === 'granted') {
                                            this.directoryHandle = handle;
                                            this.permissionGranted = true;
                                            this.updateFileSyncStatus(handle.name);
                                        } else {
                                            this.permissionGranted = false;
                                            this.updateFileSyncStatus(handle.name + ' (許可されませんでした)');
                                        }
                                    } catch (error) {
                                        this.permissionGranted = false;
                                        console.error('Directory permission request failed.', error);
                                        this.updateFileSyncStatus(handle.name + ' (エラー)');
                                    }
                                    this.updateSyncWarningIcon();
                                }, { once: true });
                            }
                        } else {
                            this.permissionGranted = false;
                        }
                    } catch (error) {
                        this.permissionGranted = false;
                        console.error('Failed to load directory handle from IndexedDB.', error);
                    }
                    this.updateSyncWarningIcon();
                },

                updateFileSyncStatus(dirName) {
                    if (dirName) {
                        this.elements.fileSyncStatus.textContent = `📁 ${dirName}`;
                        this.elements.fileSyncStatus.title = `同期先: ${dirName}`;
                        this.elements.fileSyncStatus.style.cursor = 'default';
                    } else {
                        this.elements.fileSyncStatus.textContent = '同期フォルダ未設定';
                        this.elements.fileSyncStatus.title = '';
                        this.elements.fileSyncStatus.style.cursor = 'default';
                    }
                }
            };

export { uiManager };