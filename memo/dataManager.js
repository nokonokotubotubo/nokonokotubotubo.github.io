const dataManager = {
        DB_KEY: 'memoAppData',
        db: null,
        async init() {
            await this.loadDataFromStorage();
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
            return new Promise((resolve) => {
                chrome.storage.local.get(this.DB_KEY, (result) => {
                    if (result[this.DB_KEY]) {
                        this.db = result[this.DB_KEY];
                    } else {
                        this.db = null;
                    }
                    resolve();
                });
            });
        },
        getData() { return this.db; },
        setData(d, caller = 'unknown') {
            this.db = d;
            chrome.storage.local.set({ [this.DB_KEY]: d });
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
                togglePin(id) {
                    const memo = this.db.memos.find(m => m.id === id);
                    if (memo) {
                        memo.isPinned = !memo.isPinned;
                        if (memo.isPinned) {
                            // Add a sort order for pinned memos, place new ones at the end
                            const maxSortOrder = this.db.memos
                                .filter(m => m.isPinned && m.pinnedSortOrder)
                                .reduce((max, m) => Math.max(max, m.pinnedSortOrder), 0);
                            memo.pinnedSortOrder = maxSortOrder + 1;
                        } else {
                            memo.pinnedSortOrder = null;
                        }
                        memo.updatedAt = new Date().toISOString();
                        this.setData(this.db, 'togglePin');
                        return memo;
                    }
                    return null;
                },
                createMemo(folderId) {
                    const d = this.getData();
                    const n = new Date().toISOString();
                    const newTitle = this.generateUniqueMemoTitle();
                    const m = { id: crypto.randomUUID(), title: newTitle, content: "<p><br></p>", folderId: folderId, createdAt: n, updatedAt: n, isTrash: false, isPinned: false };
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
                openFolder(folderId) { if (!folderId) return false; const folder = this.db.folders.find(f => f.id === folderId); if (folder && folder.isCollapsed) { folder.isCollapsed = false; this.setData(this.db, 'openFolder'); return true; } return false; },
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
                collapseAllFolders() {
                    const db = this.getData();
                    db.folders.forEach(f => f.isCollapsed = true);
                    this.setData(db, 'collapseAllFolders');
                },

                areAllFoldersCollapsed() {
                    const db = this.getData();
                    if (!db || !db.folders || db.folders.length === 0) {
                        return true; // No folders, so they are "all collapsed"
                    }
                    return db.folders.every(f => f.isCollapsed);
                },

                expandAllFolders() {
                    const db = this.getData();
                    db.folders.forEach(f => f.isCollapsed = false);
                    this.setData(db, 'expandAllFolders');
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

                    // 1. Create a stable sort order before normalization
                    items.sort((a, b) => {
                        const orderA = a.sortOrder ?? Infinity;
                        const orderB = b.sortOrder ?? Infinity;
                        if (orderA !== orderB) {
                            return orderA - orderB;
                        }
                        return new Date(b.createdAt) - new Date(a.createdAt);
                    });

                    // 2. Normalize sortOrder to be sequential and unique
                    items.forEach((item, index) => {
                        item.sortOrder = index;
                    });

                    const currentIndex = items.findIndex(item => item.id === id);
                    if (currentIndex === -1) return false; // Should not happen

                    let targetIndex;
                    if (direction === 'up') {
                        targetIndex = Math.max(0, currentIndex - 1);
                    } else {
                        targetIndex = Math.min(items.length - 1, currentIndex + 1);
                    }

                    if (currentIndex === targetIndex) return false; // Already at edge

                    // 3. Swap the sequential sortOrders
                    const currentItem = items[currentIndex];
                    const targetItem = items[targetIndex];

                    const tempOrder = currentItem.sortOrder;
                    currentItem.sortOrder = targetItem.sortOrder;
                    targetItem.sortOrder = tempOrder;

                    this.setData(db, 'moveItem');
                    return true;
                },

                movePinnedItem(id, direction) {
                    const db = this.getData();
                    const pinnedMemos = db.memos.filter(m => m.isPinned && !m.isTrash);

                    // 1. Create a stable sort order
                    pinnedMemos.sort((a, b) => {
                        const orderA = a.pinnedSortOrder ?? Infinity;
                        const orderB = b.pinnedSortOrder ?? Infinity;
                        if (orderA !== orderB) {
                            return orderA - orderB;
                        }
                        return new Date(a.updatedAt) - new Date(b.updatedAt); // Fallback sort
                    });

                    // 2. Normalize pinnedSortOrder to be sequential
                    pinnedMemos.forEach((memo, index) => {
                        memo.pinnedSortOrder = index;
                    });

                    const currentIndex = pinnedMemos.findIndex(m => m.id === id);
                    if (currentIndex === -1) return false;

                    let targetIndex;
                    if (direction === 'up') {
                        targetIndex = Math.max(0, currentIndex - 1);
                    } else {
                        targetIndex = Math.min(pinnedMemos.length - 1, currentIndex + 1);
                    }

                    if (currentIndex === targetIndex) return false;

                    // 3. Swap the sequential orders
                    const currentMemo = pinnedMemos[currentIndex];
                    const targetMemo = pinnedMemos[targetIndex];

                    const tempOrder = currentMemo.pinnedSortOrder;
                    currentMemo.pinnedSortOrder = targetMemo.pinnedSortOrder;
                    targetMemo.pinnedSortOrder = tempOrder;

                    this.setData(db, 'movePinnedItem');
                    return true;
                },
                
                searchMemos(q) { if (!q) return []; const db = this.getData(); const results = []; const query = q.toLowerCase(); const stripHtml = (html) => (new DOMParser().parseFromString(html, 'text/html')).body.textContent || ''; for (const memo of db.memos) { if (memo.isTrash) continue; const title = memo.title.toLowerCase(); const content = stripHtml(memo.content).toLowerCase(); const titleIndex = title.indexOf(query); const contentIndex = content.indexOf(query); if (titleIndex > -1 || contentIndex > -1) { let snippet = ''; if (contentIndex > -1) { const start = Math.max(0, contentIndex - 15); const end = Math.min(content.length, contentIndex + query.length + 15); snippet = this.escapeHTML(content.substring(start, end)).replace(new RegExp(this.escapeHTML(q), 'gi'), (match) => `<mark>${this.escapeHTML(match)}</mark>`); } else { snippet = this.escapeHTML(stripHtml(memo.content).substring(0, 100)); } results.push({ ...memo, snippet }); } } return results; },
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

                // --- File System Access API --- 
                dbPromise: null,
                getDb() {
                    if (!this.dbPromise) {
                        this.dbPromise = new Promise((resolve, reject) => {
                            const openRequest = indexedDB.open('file-sync-db', 1);
                            openRequest.onupgradeneeded = () => {
                                openRequest.result.createObjectStore('keyval');
                            };
                            openRequest.onsuccess = () => {
                                resolve(openRequest.result);
                            };
                            openRequest.onerror = (event) => {
                                reject(event.target.error);
                            };
                        });
                    }
                    return this.dbPromise;
                },
                async getHandle(key) {
                    const db = await this.getDb();
                    return new Promise((resolve, reject) => {
                        const transaction = db.transaction('keyval', 'readonly');
                        const store = transaction.objectStore('keyval');
                        const request = store.get(key);
                        request.onsuccess = () => {
                            resolve(request.result);
                        };
                        request.onerror = (event) => {
                            reject(event.target.error);
                        };
                    });
                },
                async setHandle(key, value) {
                    const db = await this.getDb();
                    return new Promise((resolve, reject) => {
                        const transaction = db.transaction('keyval', 'readwrite');
                        const store = transaction.objectStore('keyval');
                        const request = store.put(value, key);
                        request.onsuccess = () => {
                            resolve();
                        };
                        request.onerror = (event) => {
                            reject(event.target.error);
                        };
                    });
                },
            };
export { dataManager };
