document.addEventListener('DOMContentLoaded', () => {
            const dataManager = {
                DB_KEY: 'memoAppData',
                db: null,
                init() {
                    this.loadDataFromStorage();
                    if (!this.db) {
                        const data = { 
                            version: "1.0", 
                            folders: [], 
                            memos: [], 
                            settings: { 
                                theme: "light_blue", 
                                autoSave: true, 
                                activeMemoId: null, 
                                activeFolderId: null
                            } 
                        };
                        this.setData(data, 'init');
                    }
                },
                loadDataFromStorage() {
                    try {
                        const data = localStorage.getItem(this.DB_KEY);
                        this.db = data ? JSON.parse(data) : null;
                    } catch (e) {
                        console.error("Error reading data from localStorage", e);
                        this.db = null;
                    }
                },
                getData() { return this.db; },
                setData(d, caller = 'unknown') {
                    this.db = d;
                    try {
                        localStorage.setItem(this.DB_KEY, JSON.stringify(d));
                    } catch (e) {
                        console.error("LS Error:", e);
                    }
                },
                formatDateTime(date) {
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    const hours = String(date.getHours()).padStart(2, '0');
                    const minutes = String(date.getMinutes()).padStart(2, '0');
                    const seconds = String(date.getSeconds()).padStart(2, '0');
                    
                    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
                    const dayOfWeek = dayNames[date.getDay()];
                    return `${year}/${month}/${day}(${dayOfWeek}) ${hours}:${minutes}:${seconds}`;
                },
                updateMemo(id, { title: newTitle, content: newContent }) {
                    const memo = this.db.memos.find(m => m.id === id);
                    if (memo) {
                        if (memo.title !== newTitle || memo.content !== newContent) {
                            memo.title = newTitle;
                            memo.content = newContent;
                            memo.updatedAt = new Date().toISOString();
                            this.setData(this.db, 'updateMemo');
                        }
                        return memo;
                    }
                    return null;
                },
                renameMemo(id, newTitle) {
                    const memo = this.db.memos.find(m => m.id === id);
                    if (memo) {
                        if (memo.title !== newTitle) {
                            memo.title = newTitle;
                            memo.updatedAt = new Date().toISOString();
                            this.setData(this.db, 'renameMemo');
                        }
                        return memo;
                    }
                    return null;
                },
                renameFolder(id, newName) {
                    const folder = this.db.folders.find(f => f.id === id);
                    if (folder) {
                        folder.name = newName;
                        this.setData(this.db, 'renameFolder');
                        return true;
                    }
                    return false;
                },
                createMemo(folderId) {
                    const d = this.getData();
                    const n = new Date().toISOString();
                    const newTitle = this.generateUniqueMemoTitle();
                    const m = { id: crypto.randomUUID(), title: newTitle, content: "<p><br></p>", folderId: folderId, createdAt: n, updatedAt: n, isTrash: false };
                    d.memos.push(m);
                    this.setData(d, 'createMemo');
                    return m;
                },
                generateUniqueMemoTitle() {
                    const now = new Date();
                    const baseTitle = this.formatDateTime(now);
                    const existingTitles = new Set(this.db.memos.filter(m => !m.isTrash).map(m => m.title));
                    if (!existingTitles.has(baseTitle)) {
                        return baseTitle;
                    }
                    let counter = 1;
                    while (true) {
                        const newTitle = `${baseTitle}_${counter}`;
                        if (!existingTitles.has(newTitle)) {
                            return newTitle;
                        }
                        counter++;
                    }
                },
                createFolder(n, p) { const d = this.getData(); const t = new Date().toISOString(); const f = { id: crypto.randomUUID(), name: n, parentId: p, createdAt: t, isTrash: false, isCollapsed: false }; d.folders.push(f); this.setData(d, 'createFolder'); return f; },
                toggleFolderCollapse(id) { const d = this.getData(); const f = d.folders.find(f => f.id === id); if (f) { f.isCollapsed = !f.isCollapsed; this.setData(d, 'toggleFolderCollapse'); } },
                deleteMemo(id) { const db = this.getData(); const memo = db.memos.find(m => m.id === id); if (memo) { memo.isTrash = true; memo.updatedAt = new Date().toISOString(); this.setData(db, 'deleteMemo'); } },
                deleteFolder(folderId) { const db = this.getData(); const foldersToDelete = new Set([folderId]); const memosToDelete = new Set(); const findChildren = (parentId) => { db.folders.filter(f => f.parentId === parentId).forEach(f => { foldersToDelete.add(f.id); findChildren(f.id); }); db.memos.filter(m => m.folderId === parentId).forEach(m => memosToDelete.add(m.id)); }; findChildren(folderId); const now = new Date().toISOString(); db.folders.forEach(f => { if (foldersToDelete.has(f.id)) { f.isTrash = true; f.updatedAt = now; } }); db.memos.forEach(m => { if (memosToDelete.has(m.id) || m.folderId === folderId) { m.isTrash = true; m.updatedAt = now; } }); this.setData(db, 'deleteFolder'); },
                getTrashedItems() { const db = this.getData(); return { memos: db.memos.filter(m => m.isTrash), folders: db.folders.filter(f => f.isTrash) }; },
                restoreItem(id, type) { const db = this.getData(); if (type === 'memo') { const item = db.memos.find(i => i.id === id); if (item) item.isTrash = false; } else { const folder = db.folders.find(f => f.id === id); if (folder) { folder.isTrash = false; let parent = db.folders.find(f => f.id === folder.parentId); while(parent && parent.isTrash) { parent.isTrash = false; parent = db.folders.find(f => f.id === parent.parentId); } } } this.setData(db, 'restoreItem'); },
                deleteItemPermanently(id, type) { const db = this.getData(); if (type === 'memo') { db.memos = db.memos.filter(i => i.id !== id); } else { db.folders = db.folders.filter(i => i.id !== id); } this.setData(db, 'deleteItemPermanently'); },
                emptyTrash() {
                    const db = this.getData();
                    db.memos = db.memos.filter(m => !m.isTrash);
                    db.folders = db.folders.filter(f => !f.isTrash);
                    this.setData(db, 'emptyTrash');
                },
                // コピー・貼り付け機能
                copyItem(id, type) {
                    const db = this.getData();
                    if (type === 'memo') {
                        const memo = db.memos.find(m => m.id === id && !m.isTrash);
                        if (memo) {
                            return {
                                type: 'memo',
                                data: {
                                    title: memo.title + ' のコピー',
                                    content: memo.content,
                                    folderId: memo.folderId
                                }
                            };
                        }
                    } else if (type === 'folder') {
                        const folder = db.folders.find(f => f.id === id && !f.isTrash);
                        if (folder) {
                            const copyFolderRecursive = (folderId) => {
                                const folderToCopy = db.folders.find(f => f.id === folderId && !f.isTrash);
                                if (!folderToCopy) return null;
                                
                                const copiedFolder = {
                                    name: folderToCopy.name + ' のコピー',
                                    parentId: folderToCopy.parentId,
                                    isCollapsed: false
                                };
                                
                                const childFolders = db.folders
                                    .filter(f => f.parentId === folderId && !f.isTrash)
                                    .map(f => copyFolderRecursive(f.id))
                                    .filter(f => f !== null);
                                
                                const childMemos = db.memos
                                    .filter(m => m.folderId === folderId && !m.isTrash)
                                    .map(m => ({
                                        title: m.title,
                                        content: m.content
                                    }));
                                
                                return {
                                    ...copiedFolder,
                                    childFolders,
                                    childMemos
                                };
                            };
                            
                            return {
                                type: 'folder',
                                data: copyFolderRecursive(id)
                            };
                        }
                    }
                    return null;
                },
                
                pasteItem(copiedItem, targetFolderId) {
                    if (!copiedItem) return false;
                    
                    const db = this.getData();
                    const now = new Date().toISOString();
                    
                    if (copiedItem.type === 'memo') {
                        const newMemo = {
                            id: crypto.randomUUID(),
                            title: copiedItem.data.title,
                            content: copiedItem.data.content,
                            folderId: targetFolderId,
                            createdAt: now,
                            updatedAt: now,
                            isTrash: false
                        };
                        db.memos.push(newMemo);
                        this.setData(db, 'pasteItem');
                        return newMemo;
                    } else if (copiedItem.type === 'folder') {
                        const pasteFolderRecursive = (folderData, parentId) => {
                            const newFolder = {
                                id: crypto.randomUUID(),
                                name: folderData.name,
                                parentId: parentId,
                                createdAt: now,
                                isTrash: false,
                                isCollapsed: folderData.isCollapsed
                            };
                            db.folders.push(newFolder);
                            
                            folderData.childMemos.forEach(memoData => {
                                const newMemo = {
                                    id: crypto.randomUUID(),
                                    title: memoData.title,
                                    content: memoData.content,
                                    folderId: newFolder.id,
                                    createdAt: now,
                                    updatedAt: now,
                                    isTrash: false
                                };
                                db.memos.push(newMemo);
                            });
                            
                            folderData.childFolders.forEach(childFolderData => {
                                pasteFolderRecursive(childFolderData, newFolder.id);
                            });
                            
                            return newFolder;
                        };
                        const newFolder = pasteFolderRecursive(copiedItem.data, targetFolderId);
                        this.setData(db, 'pasteItem');
                        return newFolder;
                    }
                    return false;
                },
                
                // 並び替え機能
                moveItem(id, type, direction, parentId) {
                    const db = this.getData();
                    let items;
                    if (type === 'folder') {
                        items = db.folders.filter(f => f.parentId === parentId && !f.isTrash);
                    } else {
                        items = db.memos.filter(m => m.folderId === parentId && !m.isTrash);
                    }
                    
                    // sortOrderが存在しない場合は初期化
                    items.forEach((item, index) => {
                        if (item.sortOrder === undefined) {
                            item.sortOrder = index;
                        }
                    });
                    
                    // 現在のアイテムを見つける
                    const currentItem = items.find(item => item.id === id);
                    if (!currentItem) return false;
                    
                    // sortOrderでソート
                    items.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
                    
                    const currentIndex = items.findIndex(item => item.id === id);
                    let targetIndex;
                    
                    if (direction === 'up') {
                        targetIndex = Math.max(0, currentIndex - 1);
                    } else {
                        targetIndex = Math.min(items.length - 1, currentIndex + 1);
                    }
                    
                    if (currentIndex === targetIndex) return false;
                    
                    // アイテムの位置を交換
                    const temp = items[currentIndex].sortOrder;
                    items[currentIndex].sortOrder = items[targetIndex].sortOrder;
                    items[targetIndex].sortOrder = temp;
                    
                    this.setData(db, 'moveItem');
                    return true;
                },
                
                searchMemos(q) { if (!q) return []; const db = this.getData(); const results = []; const query = q.toLowerCase(); const stripHtml = (html) => (new DOMParser().parseFromString(html, 'text/html')).body.textContent || ''; for (const memo of db.memos) { if (memo.isTrash) continue; const title = memo.title.toLowerCase(); const content = stripHtml(memo.content).toLowerCase(); const titleIndex = title.indexOf(query); const contentIndex = content.indexOf(query); if (titleIndex > -1 || contentIndex > -1) { let snippet = ''; if (contentIndex > -1) { const start = Math.max(0, contentIndex - 15); const end = Math.min(content.length, contentIndex + query.length + 15); snippet = this.escapeHTML(content.substring(start, end)).replace(new RegExp(this.escapeHTML(q), 'gi'), (match) => `<mark>${match}</mark>`); } else { snippet = this.escapeHTML(stripHtml(memo.content).substring(0, 100)); } results.push({ ...memo, snippet }); } } return results; },
                exportData() { const d = this.getData(); const b = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `memo-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(u); },
                importData(f, cb) { const r = new FileReader(); r.onload = (e) => { try { const d = JSON.parse(e.target.result); if (d && d.version && d.folders && d.memos && d.settings) { this.setData(d, 'importData'); cb(true); } else { cb(false); } } catch (err) { cb(false); } }; r.readAsText(f); },
                getActiveMemoId() { return this.getData()?.settings.activeMemoId; },
                setActiveMemoId(i) { const d = this.getData(); if (d) { d.settings.activeMemoId = i; this.setData(d, 'setActiveMemoId'); } },
                getActiveFolderId() { return this.getData()?.settings.activeFolderId; },
                setActiveFolderId(i) { const d = this.getData(); if (d) { d.settings.activeFolderId = i; this.setData(d, 'setActiveFolderId'); } },
                escapeHTML(s) { if (s === null || s === undefined) { return ''; } return s.toString().replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }[m])); },

                saveTimeout: null,
                scheduleSave(callback) {
                    clearTimeout(this.saveTimeout);
                    this.saveTimeout = setTimeout(() => {
                        callback();
                    }, 500);
                },
                flushPendingSave(callback) {
                    clearTimeout(this.saveTimeout);
                    callback();
                },
            };
            const uiManager = {
                elements: {},
                quillInstance: null, currentMemoId: null, currentFolderId: null, saveTimeout: null, pendingSaveForMemoId: null, isSearching: false, contextMenuTarget: null, copiedItem: null,
                init(quill) {
                    this.quillInstance = quill;
                    this.cacheElements();
                    this.currentFolderId = dataManager.getActiveFolderId();
                    this.addEventListeners();
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
                        titleInput: document.querySelector('.app-header__title-input'),
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
                    };
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
                        this.elements.dialogInput.focus();
                    } else {
                        this.elements.dialogInput.style.display = 'none';
                    }
                    
                    this.elements.customDialogOverlay.classList.add('visible');
                    
                    const handleResponse = (confirmed) => {
                        this.elements.customDialogOverlay.classList.remove('visible');
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
                    const enterHandler = (e) => {
                        if (e.key === 'Enter') {
                            onOk();
                            document.removeEventListener('keydown', enterHandler);
                        }
                    };
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
                },
                render() { console.log("//-D- render called"); this.renderUnifiedTree(); },
                renderUnifiedTree() {
                    const db = dataManager.getData();
                    let html = '';
                    const rootMemos = this.getSortedMemos(db, null);
                    rootMemos.forEach(memo => {
                        html += this.createMemoHTML(memo, 0);
                    });

                    html += this.buildTree(db, null, 0);
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
                    return `<div class="tree-item memo ${memo.id === this.currentMemoId ? 'active' : ''}" data-type="memo" data-id="${memo.id}" data-level="${level}">
                                <div style="flex-grow: 1;">
                                    <span>${dataManager.escapeHTML(memo.title) || '無題のメモ'}</span>
                                    <div class="tree-item__snippet">${snippet}</div>
                                </div>
                                <div class="sort-buttons">
                                    <button class="sort-btn" data-action="move-up" data-id="${memo.id}" data-type="memo" data-parent="${memo.folderId || 'null'}" title="上に移動">▲</button>
                                    <button class="sort-btn" data-action="move-down" data-id="${memo.id}" data-type="memo" data-parent="${memo.folderId || 'null'}" title="下に移動">▼</button>
                                </div>
                            </div>`;
                },

                getSortedFolders(db, parentId) {
                    return db.folders
                        .filter(f => f.parentId === parentId && !f.isTrash)
                        .sort((a, b) => {
                            if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
                                return a.sortOrder - b.sortOrder;
                            }
                            return a.name.localeCompare(b.name);
                        });
                },

                getSortedMemos(db, folderId) {
                    return db.memos
                        .filter(m => m.folderId === folderId && !m.isTrash)
                        .sort((a, b) => {
                            if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
                                return a.sortOrder - b.sortOrder;
                            }
                            return new Date(a.createdAt) - new Date(b.createdAt);
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
                    }
                    if (!this.isSearching) { this.updateMemoItemInTree(this.currentMemoId, title); }
                    console.log("//-D- saveCurrentMemo END");
                },
                updateLastUpdated(isoString) {
                    if (!isoString) {
                        this.elements.editorFooter.textContent = '';
                        return;
                    }
                    const date = new Date(isoString);
                    const formattedDate = dataManager.formatDateTime(date);
                    this.elements.editorFooter.textContent = `最終更新: ${formattedDate}`;
                },
                updateMemoItemInTree(memoId, newTitle) {
                    const memoItem = this.elements.unifiedTreeContainer.querySelector(`.tree-item[data-id="${memoId}"][data-type="memo"]`);
                    if (memoItem) {
                        const titleElement = memoItem.querySelector('span');
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
                handleNewMemo() { const memo = dataManager.createMemo(this.currentFolderId); this.loadMemo(memo.id); },
                handleTreeClick(e) {
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
                            this.render();
                        }
                        return;
                    }
                    
                    const item = e.target.closest('.tree-item');
                    if (item) {
                        const type = item.dataset.type;
                        const id = item.dataset.id;
                        
                        const toggle = e.target.closest('.folder-toggle, .folder-emoji');
                        if (toggle) {
                            dataManager.toggleFolderCollapse(id);
                            this.render();
                            return;
                        }
                        
                        if (type === 'folder') {
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
                                this.render();
                            }
                        } else if (type === 'memo') {
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
                    if (e.target.classList.contains('restore-btn')) { dataManager.restoreItem(id, type); }
                    else if (e.target.classList.contains('delete-perm-btn')) { if (confirm('このアイテムを完全に削除しますか？')) dataManager.deleteItemPermanently(id, type); }
                    this.renderTrashList(); this.render();
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
                    const file = e.target.files[0]; if (!file) return;
                    dataManager.importData(file, (success) => {
                        if (success) { alert('インポートに成功しました！'); dataManager.loadDataFromStorage(); this.loadInitialMemo(); }
                        else { alert('インポートに失敗しました。ファイルの形式が正しくありません。'); }
                        e.target.value = '';
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
                }
            };
            const quill = new Quill('#editor-container', {
                theme: 'snow',
                modules: {
                    toolbar: [
                        ['bold', 'italic'],
                        [{ 'color': [] }, { 'size': ['small', false, 'large', 'huge'] }],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        ['link', 'blockquote']
                    ]
                }
            });
            dataManager.init();
            uiManager.init(quill);
        });
