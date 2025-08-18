// Minews PWA - UI・表示レイヤー（軽量化最適化版 + テキスト選択機能統合 + 評価モーダル自動表示 + 適用範囲統合最適化 + 星評価統合 + キーワード選択UI統一 + 星評価ボタン修正 + 評価削除時反映修正版 + 既存興味ワード削除確認統合版 + 画面更新制御機能統合版）
(function() {
    'use strict';

    // フィルター設定管理（軽量化版）
    const getFilterSettings = () => {
        try {
            const stored = localStorage.getItem('minews_filterSettings');
            return stored ? JSON.parse(stored) : { scoreMin: 0, scoreMax: 100, dateMin: 0, dateMax: 14 };
        } catch {
            return { scoreMin: 0, scoreMax: 100, dateMin: 0, dateMax: 14 };
        }
    };

    const saveFilterSettings = (settings) => {
        try {
            localStorage.setItem('minews_filterSettings', JSON.stringify(settings));
        } catch (error) {
            console.warn('フィルター設定の保存に失敗:', error);
        }
    };

    const updateScoreDisplay = (type, value) => {
        const numValue = parseInt(value);
        const isMin = type === 'min';
        const otherSlider = document.getElementById(isMin ? 'scoreMaxSlider' : 'scoreMinSlider');
        const otherValue = parseInt(otherSlider.value);
        const adjustedValue = isMin ? Math.min(numValue, otherValue) : Math.max(numValue, otherValue);
        
        document.getElementById(`score${type === 'min' ? 'Min' : 'Max'}Value`).textContent = adjustedValue;
        document.getElementById(`score${type === 'min' ? 'Min' : 'Max'}Slider`).value = adjustedValue;
        
        const display = document.querySelector('.modal-section-group:first-child .filter-range-display');
        if (display) {
            const minVal = isMin ? adjustedValue : otherValue;
            const maxVal = isMin ? otherValue : adjustedValue;
            display.textContent = `${minVal}点 - ${maxVal}点`;
        }
    };

    const updateDateDisplay = (type, value) => {
        const numValue = parseInt(value);
        const isMin = type === 'min';
        const otherSlider = document.getElementById(isMin ? 'dateMaxSlider' : 'dateMinSlider');
        const otherValue = parseInt(otherSlider.value);
        const adjustedValue = isMin ? Math.min(numValue, otherValue) : Math.max(numValue, otherValue);
        
        document.getElementById(`date${type === 'min' ? 'Min' : 'Max'}Value`).textContent = adjustedValue;
        document.getElementById(`date${type === 'min' ? 'Min' : 'Max'}Slider`).value = adjustedValue;
        
        const displays = document.querySelectorAll('.filter-range-display');
        if (displays.length >= 2) {
            const minVal = isMin ? adjustedValue : otherValue;
            const maxVal = isMin ? otherValue : adjustedValue;
            displays[1].textContent = `${minVal}日前 - ${maxVal}日前`;
        }
    };

    const applyFilterSettings = () => {
        const settings = {
            scoreMin: parseInt(document.getElementById('scoreMinSlider').value),
            scoreMax: parseInt(document.getElementById('scoreMaxSlider').value),
            dateMin: parseInt(document.getElementById('dateMinSlider').value),
            dateMax: parseInt(document.getElementById('dateMaxSlider').value)
        };
        
        saveFilterSettings(settings);
        // 【修正】明示的更新フラグを設定
        window.state.allowArticleUpdate = true;
        updateArticleListOnly();
        alert('フィルター設定を適用しました');
    };

    const resetFilterSettings = () => {
        const defaultSettings = { scoreMin: 0, scoreMax: 100, dateMin: 0, dateMax: 14 };
        saveFilterSettings(defaultSettings);
        
        ['scoreMin', 'scoreMax', 'dateMin', 'dateMax'].forEach(key => {
            const value = defaultSettings[key];
            document.getElementById(key + 'Slider').value = value;
            document.getElementById(key + 'Value').textContent = value;
        });
        
        const displays = document.querySelectorAll('.filter-range-display');
        if (displays[0]) displays[0].textContent = '0点 - 100点';
        if (displays[1]) displays[1].textContent = '0日前 - 14日前';
        
        // 【修正】明示的更新フラグを設定
        window.state.allowArticleUpdate = true;
        updateArticleListOnly();
        alert('フィルター設定をリセットしました');
    };

    // 軽量トースト通知
    const showToastNotification = (message, type = 'success') => {
        const existingToast = document.querySelector('.toast-notification');
        if (existingToast) existingToast.remove();
        
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.style.cssText = `position: fixed; top: 20px; right: 20px; background: ${type === 'error' ? '#f44336' : '#4caf50'}; color: white; padding: 12px 20px; border-radius: 6px; z-index: 10001; font-size: 14px; box-shadow: 0 2px 10px rgba(0,0,0,0.3); max-width: 300px; word-wrap: break-word; opacity: 0; transform: translateX(100%); transition: opacity 0.3s ease, transform 0.3s ease;`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        });
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.parentNode?.removeChild(toast), 300);
        }, 2500);
    };

    // テキスト選択コンテキストメニュー機能（修正版）
    const TextSelectionManager = {
        selectedText: '',
        selectionMenu: null,
        isTouch: false,
        
        init() {
            document.addEventListener('contextmenu', this.handleRightClick.bind(this));
            document.addEventListener('touchstart', this.handleTouchStart.bind(this));
            document.addEventListener('touchend', this.handleTouchEnd.bind(this));
            document.addEventListener('selectionchange', this.handleSelectionChange.bind(this));
            document.addEventListener('click', this.hideSelectionMenu.bind(this));
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') this.hideSelectionMenu();
            });
        },
        
        handleRightClick(event) {
            if (window.state.showModal) return;
            
            const selection = window.getSelection();
            const selectedText = selection.toString().trim();
            const articleCard = event.target.closest('.article-card');
            if (!articleCard) return;
            
            if (selectedText && selectedText.length >= 2 && selectedText.length <= 50) {
                event.preventDefault();
                event.stopPropagation();
                this.selectedText = selectedText;
                this.showSelectionMenu(event.pageX, event.pageY);
            }
        },
        
        handleTouchStart(event) {
            this.isTouch = true;
        },
        
        handleTouchEnd(event) {
            if (!this.isTouch) return;
            setTimeout(() => {
                this.handleSelectionChange();
            }, 100);
        },
        
        handleSelectionChange() {
            if (window.state.showModal) return;
            
            const selection = window.getSelection();
            const selectedText = selection.toString().trim();
            
            if (!selectedText || selectedText.length < 2 || selectedText.length > 50) {
                this.hideSelectionMenu();
                return;
            }
            
            const range = selection.getRangeAt(0);
            const container = range.commonAncestorContainer;
            const element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
            const articleCard = element.closest('.article-card');
            
            if (!articleCard) {
                this.hideSelectionMenu();
                return;
            }
            
            this.selectedText = selectedText;
            
            if (this.isTouch) {
                const rect = range.getBoundingClientRect();
                const x = rect.left + (rect.width / 2);
                const y = rect.bottom + 10;
                this.showSelectionMenu(x, y);
            }
        },
        
        showSelectionMenu(x, y) {
            this.hideSelectionMenu();
            
            const menu = document.createElement('div');
            menu.className = 'text-selection-menu';
            menu.onclick = (e) => e.stopPropagation();
            
            const menuWidth = 200;
            const menuHeight = 100;
            const adjustedX = Math.min(x, window.innerWidth - menuWidth - 10);
            const adjustedY = Math.min(y, window.innerHeight - menuHeight - 10);
            
            menu.style.cssText = `
                position: fixed;
                left: ${adjustedX}px;
                top: ${adjustedY}px;
                background: #24323d;
                border: 1px solid #4eb3d3;
                border-radius: 8px;
                padding: 0.5rem;
                z-index: 10002;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                min-width: 180px;
                animation: fadeInScale 0.2s ease-out;
            `;
            
            menu.innerHTML = `
                <div style="color: #e0e6eb; font-size: 0.8rem; margin-bottom: 0.5rem; text-align: center; word-break: break-word;">
                    「${this.selectedText.substring(0, 20)}${this.selectedText.length > 20 ? '...' : ''}」
                </div>
                <div style="display: flex; gap: 0.5rem; justify-content: center;">
                    <button class="selection-btn interest-btn" onclick="TextSelectionManager.addAsInterestWord()">
                        興味ワード
                    </button>
                    <button class="selection-btn ng-btn" onclick="TextSelectionManager.addAsNGWord()">
                        NGワード
                    </button>
                </div>
            `;
            
            document.body.appendChild(menu);
            this.selectionMenu = menu;
        },
        
        hideSelectionMenu() {
            if (this.selectionMenu) {
                document.body.removeChild(this.selectionMenu);
                this.selectionMenu = null;
            }
            this.isTouch = false;
        },
        
        addAsInterestWord() {
            if (!this.selectedText) return;
            
            window._pendingTextSelection = { word: this.selectedText, type: 'interest' };
            window.setState({ showModal: 'addInterestWord' });
            
            this.hideSelectionMenu();
            if (window.getSelection) {
                window.getSelection().removeAllRanges();
            }
        },
        
        addAsNGWord() {
            if (!this.selectedText) return;
            
            const confirmAdd = confirm(`「${this.selectedText}」をNGワードとして追加しますか？\n\n該当する記事は表示されなくなります。`);
            if (!confirmAdd) {
                this.hideSelectionMenu();
                return;
            }
            
            window._pendingTextSelection = { word: this.selectedText, type: 'ng' };
            window.setState({ showModal: 'addNGWord' });
            
            this.hideSelectionMenu();
            if (window.getSelection) {
                window.getSelection().removeAllRanges();
            }
        }
    };

    // 【修正統合】キーワード選択メニュー機能（既存興味ワードの削除確認対応版）
    const showKeywordSelectionMenu = (keyword, event) => {
        event.stopPropagation();
        
        const existingMenu = document.querySelector('.keyword-selection-menu');
        if (existingMenu) existingMenu.remove();
        
        const menu = document.createElement('div');
        menu.className = 'keyword-selection-menu';
        menu.onclick = (e) => e.stopPropagation();
        
        const rect = event.target.getBoundingClientRect();
        const menuWidth = 200;
        const menuHeight = 120;
        const x = rect.left + (rect.width / 2) - (menuWidth / 2);
        const y = rect.bottom + 10;
        const adjustedX = Math.min(Math.max(x, 10), window.innerWidth - menuWidth - 10);
        const adjustedY = Math.min(y, window.innerHeight - menuHeight - 10);
        
        menu.style.cssText = `
            position: fixed;
            left: ${adjustedX}px;
            top: ${adjustedY}px;
            background: #24323d;
            border: 1px solid #4eb3d3;
            border-radius: 8px;
            padding: 0.5rem;
            z-index: 10002;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            min-width: 180px;
            animation: fadeInScale 0.2s ease-out;
        `;
        
        const currentRating = window.WordRatingManager?.getWordRating(keyword) || 0;
        const ratingInfo = currentRating > 0 ? ` (現在: ${currentRating}星)` : '';
        
        // 【修正】既に興味ワードに登録されているかチェック
        const wordHook = window.DataHooks.useWordFilters();
        const isAlreadyInterestWord = wordHook.wordFilters.interestWords.includes(keyword);
        
        // 【修正】既存興味ワードの場合は削除ボタンのみ表示
        const buttonSection = isAlreadyInterestWord ? `
            <div style="display: flex; gap: 0.5rem; justify-content: center; margin-bottom: 0.5rem;">
                <button class="selection-btn interest-btn" onclick="handleKeywordRemoveFromInterest('${keyword.replace(/'/g, "\\'")}')">
                    興味ワードから削除
                </button>
                <button class="selection-btn ng-btn" onclick="handleKeywordAsNGWord('${keyword.replace(/'/g, "\\'")}')">
                    NGワード
                </button>
            </div>
        ` : `
            <div style="display: flex; gap: 0.5rem; justify-content: center; margin-bottom: 0.5rem;">
                <button class="selection-btn interest-btn" onclick="handleKeywordAsInterestWord('${keyword.replace(/'/g, "\\'")}')">
                    興味ワード
                </button>
                <button class="selection-btn ng-btn" onclick="handleKeywordAsNGWord('${keyword.replace(/'/g, "\\'")}')">
                    NGワード
                </button>
            </div>
        `;
        
        menu.innerHTML = `
            <div style="color: #e0e6eb; font-size: 0.8rem; margin-bottom: 0.5rem; text-align: center; word-break: break-word;">
                「${keyword.substring(0, 20)}${keyword.length > 20 ? '...' : ''}」${ratingInfo}
            </div>
            ${buttonSection}
            ${currentRating > 0 ? `
            <div style="text-align: center; border-top: 1px solid #4eb3d3; padding-top: 0.5rem; margin-top: 0.5rem;">
                <button class="selection-btn rating-btn" onclick="showWordRatingModal('${keyword.replace(/'/g, "\\'")}', 'keyword')" style="background: #fbbf24; color: #000;">
                    星評価を変更
                </button>
            </div>
            ` : ''}
        `;
        
        document.body.appendChild(menu);
        
        setTimeout(() => {
            const closeOnOutsideClick = (e) => {
                if (!menu.contains(e.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeOnOutsideClick);
                }
            };
            document.addEventListener('click', closeOnOutsideClick);
        }, 100);
    };

    const handleKeywordAsInterestWord = (keyword) => {
        const menu = document.querySelector('.keyword-selection-menu');
        if (menu) menu.remove();
        
        window._pendingTextSelection = { word: keyword, type: 'interest' };
        window.setState({ showModal: 'addInterestWord' });
    };

    const handleKeywordAsNGWord = (keyword) => {
        const menu = document.querySelector('.keyword-selection-menu');
        if (menu) menu.remove();
        
        const confirmAdd = confirm(`「${keyword}」をNGワードとして追加しますか？\n\n該当する記事は表示されなくなります。`);
        if (!confirmAdd) return;
        
        window._pendingTextSelection = { word: keyword, type: 'ng' };
        window.setState({ showModal: 'addNGWord' });
    };

    // 【新規追加】既存興味ワードから削除する関数
    const handleKeywordRemoveFromInterest = (keyword) => {
        const menu = document.querySelector('.keyword-selection-menu');
        if (menu) menu.remove();
        
        const confirmRemove = confirm(`「${keyword}」を興味ワードから削除しますか？\n\n星評価も同時に削除されます。`);
        if (!confirmRemove) return;
        
        try {
            const wordHook = window.DataHooks.useWordFilters();
            const success = wordHook.removeInterestWord(keyword);
            
            if (success) {
                // 星評価も削除
                if (window.WordRatingManager) {
                    window.WordRatingManager.saveWordRating(keyword, 0);
                }
                
                // キーワード強調表示を更新
                updateKeywordHighlighting(keyword, 0);
                // 【修正】画面更新制御: 記事リストは更新しない
                
                if (window.GistSyncManager?.isEnabled) {
                    window.GistSyncManager.markAsChanged();
                }
                
                showToastNotification(`「${keyword}」を興味ワードから削除しました`, 'error');
                
                if (window.state?.showModal === 'settings') {
                    setTimeout(() => window.render(), 150);
                }
            } else {
                alert('興味ワードの削除に失敗しました');
            }
        } catch (error) {
            console.error('興味ワード削除エラー:', error);
            alert('興味ワードの削除中にエラーが発生しました: ' + error.message);
        }
    };

    // ★追加：キーワード強調表示を更新する関数
    const updateKeywordHighlighting = (word, rating) => {
        const wordElements = document.querySelectorAll(`.keyword, .word-tag.interest`);
        wordElements.forEach(element => {
            // 評価を表す★数字を削除して比較
            const elementText = element.textContent.replace(/\s★\d+$/, '').trim();
            if (elementText === word) {
                // 基本クラスは「keyword」か「word-tag interest」
                const baseClass = element.classList.contains('word-tag') ? 'word-tag interest' : 'keyword';
                // 既存のrated-*クラスをすべて削除
                element.className = baseClass; 
                if (rating > 0) {
                    element.classList.add(`rated-${rating}`);
                }
                // 表示文字を適切に更新
                const wordText = word + (rating > 0 ? ` ★${rating}` : '');
                if (element.classList.contains('word-tag')) {
                    const removeButton = element.querySelector('.word-remove');
                    element.innerHTML = wordText;
                    if (removeButton) element.appendChild(removeButton);
                } else {
                    element.textContent = wordText;
                }
                element.title = `クリックして操作 (現在: ${rating > 0 ? rating + '星' : '未評価'})`;
            }
        });
    };
    // ワード評価モーダル（統合最適化版）
    const showWordRatingModal = (word, source = 'keyword') => {
        const currentRating = window.WordRatingManager?.getWordRating(word) || 0;
        
        if (currentRating > 0) {
            const confirmChange = confirm(`「${word}」は既に${currentRating}星で評価済みです。\n\n評価を変更しますか？`);
            if (!confirmChange) return;
        }
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.7); display: flex; justify-content: center; align-items: center; z-index: 10000; backdrop-filter: blur(3px);';
        
        const starsHtml = Array.from({length: 5}, (_, i) => {
            const rating = i + 1;
            const isActive = rating <= currentRating;
            return `<button class="popup-star ${isActive ? 'active' : ''}" data-rating="${rating}" onmouseover="highlightStars(${rating})" onmouseout="resetStars('${word.replace(/'/g, "\\'")}', ${currentRating})" onclick="selectWordRating('${word.replace(/'/g, "\\'")}', ${rating}, '${source}')">★</button>`;
        }).join('');
        
        const statusMessage = currentRating > 0 
            ? `<div style="color: #fbbf24; font-weight: 600;">現在の評価: ${currentRating}星</div>`
            : `<div style="color: #9ca3af;">評価なし</div>`;
        
        const isInterestWord = source === 'interest';
        const modalTitle = isInterestWord ? 'ワード評価（興味ワード）' : 'ワード評価（記事キーワード）';
        const modalColor = isInterestWord ? '#4caf50' : '#4eb3d3';
        const ratingDescription = isInterestWord 
            ? '<div>1星: 低関心 (+2) | 2星: やや関心 (+4) | 3星: 普通関心 (+6)</div><div>4星: 高関心 (+8) | 5星: 最高関心 (+10)</div>'
            : '<div>1星: 低評価 (-10) | 2星: やや低評価 (-5) | 3星: 中立 (0)</div><div>4星: やや高評価 (+5) | 5星: 高評価 (+10)</div>';
        
        modal.innerHTML = `
            <div class="keyword-rating-popup" onclick="event.stopPropagation()" style="background: #24323d; border-radius: 12px; padding: 2rem; min-width: 350px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5); text-align: center; color: #e0e6eb;">
                <h3 style="margin: 0 0 1rem 0; color: ${modalColor};">${modalTitle}</h3>
                <div style="margin-bottom: 1rem;"><span style="font-size: 1.1rem; font-weight: 600;">${word}</span></div>
                <div style="margin-bottom: 1rem;">${statusMessage}</div>
                <div class="rating-stars" style="margin-bottom: 1.5rem; display: flex; justify-content: center; gap: 0.5rem;">${starsHtml}</div>
                <div style="margin-bottom: 1.5rem; font-size: 0.9rem; color: #9ca3af;">${ratingDescription}</div>
                <div style="display: flex; gap: 0.75rem; justify-content: center;">
                    <button onclick="closeWordRatingModal()" style="background: #6b7280; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-size: 0.9rem;">キャンセル</button>
                    ${currentRating > 0 ? `<button onclick="selectWordRating('${word.replace(/'/g, "\\'")}', 0, '${source}')" style="background: #f44336; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-size: 0.9rem;">評価を削除</button>` : ''}
                </div>
            </div>
        `;
        
        modal.onclick = () => closeWordRatingModal();
        document.body.appendChild(modal);
        window._currentWordModal = modal;
    };

    const closeWordRatingModal = () => {
        if (window._currentWordModal) {
            document.body.removeChild(window._currentWordModal);
            window._currentWordModal = null;
        }
    };

    const highlightStars = (rating) => {
        const stars = document.querySelectorAll('.popup-star');
        stars.forEach((star, index) => {
            star.classList.toggle('active', index < rating);
        });
    };

    const resetStars = (word, originalRating) => {
        const stars = document.querySelectorAll('.popup-star');
        stars.forEach((star, index) => {
            star.classList.toggle('active', index < originalRating);
        });
    };

    const selectWordRating = (word, rating, source = 'keyword') => {
        try {
            if (!window.WordRatingManager) {
                alert('ワード評価システムが初期化されていません');
                return;
            }
            
            const currentRating = window.WordRatingManager.getWordRating(word) || 0;
            
            if (currentRating === rating && rating > 0) {
                alert(`「${word}」は既に${rating}星で評価済みです`);
                closeWordRatingModal();
                return;
            }
            
            if (rating === 0 && currentRating > 0) {
                const confirmDelete = confirm(`「${word}」の${currentRating}星評価を削除しますか？`);
                if (!confirmDelete) {
                    closeWordRatingModal();
                    return;
                }
            }
            
            const success = window.WordRatingManager.saveWordRating(word, rating);
            
            if (success) {
                setTimeout(() => {
                    // ★追加：キーワード強調表示を先に更新
                    updateKeywordHighlighting(word, rating);
                    // 【修正】画面更新制御: 記事リストは更新しない
                    
                    if (window.GistSyncManager?.isEnabled) {
                        window.GistSyncManager.markAsChanged();
                        if (window._syncTimeout) clearTimeout(window._syncTimeout);
                        window._syncTimeout = setTimeout(() => {
                            if (window.GistSyncManager?.isEnabled && !window.GistSyncManager.isSyncing) {
                                window.GistSyncManager.autoSync('background');
                            }
                            window._syncTimeout = null;
                        }, 3000);
                    }
                    
                    const message = rating === 0 
                        ? `「${word}」の評価を削除しました`
                        : currentRating > 0 
                            ? `「${word}」の評価を${currentRating}星から${rating}星に変更しました`
                            : `「${word}」を${rating}星に評価しました`;
                    
                    showToastNotification(message, rating === 0 ? 'error' : 'success');
                    
                    if (window.state?.showModal === 'settings') {
                        setTimeout(() => window.render(), 150);
                    }
                }, 50);
            } else {
                alert('ワード評価の保存に失敗しました');
            }
        } catch (error) {
            console.error('ワード評価処理中にエラーが発生:', error);
            alert('ワード評価処理中にエラーが発生しました: ' + error.message);
        }
        
        closeWordRatingModal();
    };

    // インライン星評価管理（修正版）
    let currentInlineRating = 0;

    const initializeInlineStarEvents = () => {
        document.querySelectorAll('.inline-star').forEach(star => {
            star.replaceWith(star.cloneNode(true));
        });
        
        const clearButton = document.querySelector('.inline-star-clear');
        if (clearButton) {
            clearButton.replaceWith(clearButton.cloneNode(true));
        }
        
        document.querySelectorAll('.inline-star').forEach(star => {
            const rating = parseInt(star.dataset.rating);
            
            star.addEventListener('click', (e) => {
                e.stopPropagation();
                selectInlineRating(rating);
            });
            
            star.addEventListener('mouseover', (e) => {
                e.stopPropagation();
                highlightInlineStars(rating);
            });
            
            star.addEventListener('mouseout', (e) => {
                e.stopPropagation();
                resetInlineStars(currentInlineRating);
            });
        });
        
        const newClearButton = document.querySelector('.inline-star-clear');
        if (newClearButton) {
            newClearButton.addEventListener('click', (e) => {
                e.stopPropagation();
                selectInlineRating(0);
            });
        }
    };

    const highlightInlineStars = (rating) => {
        const stars = document.querySelectorAll('.inline-star');
        stars.forEach((star, index) => {
            const starRating = index + 1;
            if (starRating <= rating) {
                star.style.color = '#fbbf24';
                star.classList.add('active');
            } else {
                star.style.color = '#6b7280';
                star.classList.remove('active');
            }
        });
    };

    const resetInlineStars = (originalRating) => {
        const stars = document.querySelectorAll('.inline-star');
        stars.forEach((star, index) => {
            const starRating = index + 1;
            if (starRating <= originalRating) {
                star.style.color = '#fbbf24';
                star.classList.add('active');
            } else {
                star.style.color = '#6b7280';
                star.classList.remove('active');
            }
        });
    };

    const selectInlineRating = (rating) => {
        currentInlineRating = rating;
        const stars = document.querySelectorAll('.inline-star');
        stars.forEach((star, index) => {
            const starRating = index + 1;
            if (starRating <= rating) {
                star.style.color = '#fbbf24';
                star.classList.add('active');
            } else {
                star.style.color = '#6b7280';
                star.classList.remove('active');
            }
        });
    };

    // ユニークID生成機能
    const encodeToValidId = (text) => encodeURIComponent(text).replace(/[^A-Za-z0-9_-]/g, '_');

    const generateUniqueIds = (articles, prefix = '') => {
        const folders = [...new Set(articles.map(a => a.folderName))].sort();
        const folderIds = {};
        const feedIds = {};
        
        folders.forEach((folder) => {
            const encodedFolder = encodeToValidId(folder);
            folderIds[folder] = `${prefix}folder_${encodedFolder}`;
            feedIds[folder] = {};
            
            const feeds = [...new Set(articles.filter(a => a.folderName === folder).map(a => a.rssSource))].sort();
            feeds.forEach((feed) => {
                const encodedFeed = encodeToValidId(feed);
                feedIds[folder][feed] = `${prefix}feed_${encodedFolder}_${encodedFeed}`;
            });
        });
        
        return { folderIds, feedIds };
    };

    // フィルター状態永続化
    const getStoredFilterState = () => {
        try {
            const stored = localStorage.getItem('minews_filterState');
            return stored ? JSON.parse(stored) : { viewMode: 'all', selectedFolders: [], selectedFeeds: [] };
        } catch {
            return { viewMode: 'all', selectedFolders: [], selectedFeeds: [] };
        }
    };

    const saveFilterState = (viewMode, selectedFolders, selectedFeeds) => {
        try {
            localStorage.setItem('minews_filterState', JSON.stringify({ viewMode, selectedFolders, selectedFeeds }));
        } catch (error) {
            console.warn('フィルター状態の保存に失敗:', error);
        }
    };

    // アプリケーション状態管理（画面更新制御フラグ追加）
    const initialFilterState = getStoredFilterState();
    window.state = {
        viewMode: initialFilterState.viewMode,
        selectedFolders: initialFilterState.selectedFolders,
        selectedFeeds: initialFilterState.selectedFeeds,
        showModal: null,
        articles: [],
        isLoading: false,
        lastUpdate: null,
        isSyncUpdating: false,
        isBackgroundSyncing: false,
        allowArticleUpdate: false // 【追加】記事リスト更新制御フラグ
    };

    const initializeFolderFeeds = () => {
        const folders = [...new Set(window.state.articles.map(article => article.folderName))].sort();
        const feeds = [...new Set(window.state.articles.map(article => article.rssSource))].sort();
        
        if (window.state.selectedFolders.length === 0) window.state.selectedFolders = [...folders];
        if (window.state.selectedFeeds.length === 0) window.state.selectedFeeds = [...feeds];
    };

    window.setState = (newState) => {
        window.state = { ...window.state, ...newState };
        
        if (newState.viewMode !== undefined || newState.selectedFolders !== undefined || newState.selectedFeeds !== undefined) {
            saveFilterState(
                newState.viewMode || window.state.viewMode,
                newState.selectedFolders || window.state.selectedFolders,
                newState.selectedFeeds || window.state.selectedFeeds
            );
        }
        
        window.render();
    };

    const initializeData = () => {
        const articlesData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.ARTICLES, window.DEFAULT_DATA.articles);
        const aiData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, window.DEFAULT_DATA.aiLearning);
        const wordData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, window.DEFAULT_DATA.wordFilters);

        Object.assign(window.DataHooksCache, { articles: articlesData, aiLearning: aiData, wordFilters: wordData });
        window.state.articles = articlesData;
        initializeFolderFeeds();
    };

    const initializeGistSync = () => {
        if (window.GistSyncManager) {
            const config = window.GistSyncManager.loadConfig();
            if (config?.hasToken) {
                window.GistSyncManager.startPeriodicSync(60);
            }
        }
    };

    window.initializeGistSync = initializeGistSync;

    // ユーティリティ関数
    window.formatDate = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = now - date;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor(diffTime / (1000 * 60 * 60));

        if (diffHours < 1) return '1時間以内';
        if (diffHours < 24) return `${diffHours}時間前`;
        if (diffDays === 1) return '昨日';
        if (diffDays < 7) return `${diffDays}日前`;
        return date.toLocaleDateString('ja-JP');
    };

    window.truncateText = (text, maxLength = 200) => text.length <= maxLength ? text : text.substring(0, maxLength).trim() + '...';

    const formatLastSyncTime = (isoString) => {
        try {
            const date = new Date(isoString);
            return date.toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
        } catch {
            return '日時不明';
        }
    };

    // 部分更新関数（画面更新制御機能追加）
    const updateArticleCount = () => {
        const count = getFilteredArticles().length;
        const mobileUpdate = document.querySelector('.last-update-mobile');
        const desktopUpdate = document.querySelector('.last-update');
        
        if (mobileUpdate) mobileUpdate.textContent = `表示中: ${count}件`;
        if (desktopUpdate) desktopUpdate.textContent = `表示中: ${count}件`;
    };

    const updateArticleListOnly = () => {
        // 【追加】更新許可フラグをチェック
        if (!window.state.allowArticleUpdate) {
            console.log('記事リスト表示更新は保留されています');
            return;
        }

        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.innerHTML = renderArticleList();
            updateArticleCount();
        }

        // 【追加】更新後はフラグを戻す
        window.state.allowArticleUpdate = false;
    };

    const updateFolderButtonCount = () => {
        const folders = [...new Set(window.state.articles.map(article => article.folderName))].sort();
        
        document.querySelectorAll('.folder-dropdown-btn').forEach(btn => {
            const countText = `フォルダ選択 (${window.state.selectedFolders.length}/${folders.length})`;
            const textNode = btn.childNodes[0];
            if (textNode?.nodeType === Node.TEXT_NODE) {
                textNode.textContent = countText;
            } else {
                btn.innerHTML = `${countText}<span class="dropdown-arrow">▼</span>`;
            }
        });
    };

    const updateFeedCheckboxStates = () => {
        document.querySelectorAll('.folder-dropdown-content').forEach(dropdown => {
            const feedCheckboxes = dropdown.querySelectorAll('[id*="feed_"]');
            feedCheckboxes.forEach(checkbox => {
                const feedElement = checkbox.closest('label').querySelector('.feed-name');
                if (feedElement) {
                    const feedName = feedElement.textContent.trim();
                    checkbox.checked = window.state.selectedFeeds.includes(feedName);
                }
            });
        });
    };

    const updateFolderCheckboxStates = () => {
        const folders = [...new Set(window.state.articles.map(article => article.folderName))].sort();
        
        document.querySelectorAll('.folder-dropdown-content').forEach(dropdown => {
            const selectAllCheckbox = dropdown.querySelector('[id$="selectAllFolders"]');
            if (selectAllCheckbox) {
                selectAllCheckbox.checked = folders.every(folder => window.state.selectedFolders.includes(folder));
            }
            
            folders.forEach(folder => {
                const checkbox = dropdown.querySelector(`[id$="folder_${encodeToValidId(folder)}"]`);
                if (checkbox) {
                    checkbox.checked = window.state.selectedFolders.includes(folder);
                }
            });
        });
        
        updateFeedCheckboxStates();
    };

    // 一括既読化処理
    const handleBulkMarkAsRead = () => {
        if (!confirm('表示している記事を一括で既読にしますか？')) return;
        
        const filteredArticles = getFilteredArticles();
        const articlesHook = window.DataHooks.useArticles();
        let updatedCount = 0;
        
        filteredArticles.forEach(article => {
            if (article.readStatus === 'unread') {
                articlesHook.updateArticle(article.id, { readStatus: 'read' }, { skipRender: true });
                updatedCount++;
            }
        });
        
        if (updatedCount > 0) {
            // 【修正】明示的更新フラグを設定
            window.state.allowArticleUpdate = true;
            updateArticleListOnly();
            if (window.GistSyncManager?.isEnabled) {
                window.GistSyncManager.markAsChanged();
            }
            alert(`${updatedCount}件の記事を既読にしました`);
        } else {
            alert('既読にする記事がありませんでした');
        }
    };

    // フォルダ・フィード管理（明示的更新フラグ設定）
    const handleFolderToggle = (folderName, event) => {
        event?.stopPropagation();
        
        const selectedFolders = [...window.state.selectedFolders];
        const selectedFeeds = [...window.state.selectedFeeds];
        const index = selectedFolders.indexOf(folderName);
        
        const feedsInFolder = [...new Set(window.state.articles
            .filter(article => article.folderName === folderName)
            .map(article => article.rssSource)
        )];
        
        if (index > -1) {
            selectedFolders.splice(index, 1);
            feedsInFolder.forEach(feed => {
                const feedIndex = selectedFeeds.indexOf(feed);
                if (feedIndex > -1) selectedFeeds.splice(feedIndex, 1);
            });
        } else {
            selectedFolders.push(folderName);
            feedsInFolder.forEach(feed => {
                if (!selectedFeeds.includes(feed)) selectedFeeds.push(feed);
            });
        }
        
        window.state.selectedFolders = selectedFolders;
        window.state.selectedFeeds = selectedFeeds;
        saveFilterState(window.state.viewMode, selectedFolders, selectedFeeds);
        
        // 【修正】明示的更新フラグを設定
        window.state.allowArticleUpdate = true;
        updateArticleListOnly();
        updateFolderButtonCount();
        updateFolderCheckboxStates();
    };

    const handleFeedToggle = (feedName, event) => {
        event?.stopPropagation();
        
        const selectedFeeds = [...window.state.selectedFeeds];
        const index = selectedFeeds.indexOf(feedName);
        
        if (index > -1) {
            selectedFeeds.splice(index, 1);
        } else {
            selectedFeeds.push(feedName);
        }
        
        window.state.selectedFeeds = selectedFeeds;
        saveFilterState(window.state.viewMode, window.state.selectedFolders, selectedFeeds);
        
        // 【修正】明示的更新フラグを設定
        window.state.allowArticleUpdate = true;
        updateArticleListOnly();
        updateFolderButtonCount();
        updateFeedCheckboxStates();
    };

    const handleSelectAllFolders = (selectAll, event) => {
        event?.stopPropagation();
        
        let selectedFolders, selectedFeeds;
        if (selectAll) {
            selectedFolders = [...new Set(window.state.articles.map(article => article.folderName))].sort();
            selectedFeeds = [...new Set(window.state.articles.map(article => article.rssSource))].sort();
        } else {
            selectedFolders = [];
            selectedFeeds = [];
        }
        
        window.state.selectedFolders = selectedFolders;
        window.state.selectedFeeds = selectedFeeds;
        saveFilterState(window.state.viewMode, selectedFolders, selectedFeeds);
        
        // 【修正】明示的更新フラグを設定
        window.state.allowArticleUpdate = true;
        updateArticleListOnly();
        updateFolderButtonCount();
        updateFolderCheckboxStates();
    };

    const renderFolderDropdown = (prefix = '') => {
        const folders = [...new Set(window.state.articles.map(article => article.folderName))].sort();
        const uniqueIds = generateUniqueIds(window.state.articles, prefix);
        
        const foldersByFeed = {};
        window.state.articles.forEach(article => {
            if (!foldersByFeed[article.folderName]) {
                foldersByFeed[article.folderName] = new Set();
            }
            foldersByFeed[article.folderName].add(article.rssSource);
        });
        
        const allFoldersSelected = folders.every(folder => window.state.selectedFolders.includes(folder));
        
        return `
            <div class="folder-dropdown">
                <button type="button" class="folder-dropdown-btn" onclick="toggleFolderDropdown('${prefix}')">
                    フォルダ選択 (${window.state.selectedFolders.length}/${folders.length})
                    <span class="dropdown-arrow">▼</span>
                </button>
                <div class="folder-dropdown-content" id="${prefix}folderDropdownContent" style="display: none; position: fixed; left: 0; top: 120px; width: 100vw; max-height: calc(100vh - 120px); overflow-y: auto; background-color: #1f2937; z-index: 1000; box-shadow: 0 4px 6px rgba(0,0,0,0.3); padding: 1rem;">
                    <div class="folder-controls">
                        <label class="folder-item" for="${prefix}selectAllFolders">
                            <input type="checkbox" id="${prefix}selectAllFolders" name="${prefix}selectAllFolders" ${allFoldersSelected ? 'checked' : ''} onchange="event.stopPropagation(); handleSelectAllFolders(this.checked, event)">
                            <span>すべてのフォルダ</span>
                        </label>
                    </div>
                    <hr class="folder-separator">
                    ${folders.map((folder) => {
                        const folderId = uniqueIds.folderIds[folder];
                        return `
                        <div class="folder-group">
                            <label class="folder-item" for="${folderId}">
                                <input type="checkbox" id="${folderId}" name="${folderId}" ${window.state.selectedFolders.includes(folder) ? 'checked' : ''} onchange="event.stopPropagation(); handleFolderToggle('${folder.replace(/'/g, "\\'")}', event)">
                                <span class="folder-name">${folder}</span>
                            </label>
                            <div class="feed-list">
                                ${Array.from(foldersByFeed[folder]).map((feed) => {
                                    const feedId = uniqueIds.feedIds[folder][feed];
                                    return `
                                    <label class="feed-item" for="${feedId}">
                                        <input type="checkbox" id="${feedId}" name="${feedId}" ${window.state.selectedFeeds.includes(feed) ? 'checked' : ''} onchange="event.stopPropagation(); handleFeedToggle('${feed.replace(/'/g, "\\'")}', event)">
                                        <span class="feed-name">${feed}</span>
                                    </label>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    };

    const toggleFolderDropdown = (prefix = '') => {
        const content = document.getElementById(`${prefix}folderDropdownContent`);
        if (!content) return;

        const isVisible = content.style.display !== 'none';
        
        if (isVisible) {
            content.style.display = 'none';
            if (window._currentCloseHandler) {
                document.removeEventListener('click', window._currentCloseHandler);
                window._currentCloseHandler = null;
            }
        } else {
            content.style.display = 'block';

            setTimeout(() => {
                const closeOnOutsideClick = (event) => {
                    const isInsideDropdown = content.contains(event.target);
                    const isDropdownButton = event.target.closest('.folder-dropdown-btn');
                    
                    if (!isInsideDropdown && !isDropdownButton) {
                        content.style.display = 'none';
                        document.removeEventListener('click', closeOnOutsideClick);
                        window._currentCloseHandler = null;
                    }
                };
                
                if (window._currentCloseHandler) {
                    document.removeEventListener('click', window._currentCloseHandler);
                }
                
                document.addEventListener('click', closeOnOutsideClick);
                window._currentCloseHandler = closeOnOutsideClick;
            }, 100);
        }
    };

    // 統合ワード設定モーダル（星評価修正版）
    const renderWordSettingModal = (type, editWord = null) => {
        const folders = [...new Set(window.state.articles.map(article => article.folderName))].sort();
        const feeds = [...new Set(window.state.articles.map(article => article.rssSource))].sort();
        
        const isEdit = editWord !== null;
        const title = type === 'interest' 
            ? (isEdit ? '興味ワード編集' : '興味ワード追加')
            : (isEdit ? 'NGワード編集' : 'NGワード追加');
        
        const initialWord = window._pendingTextSelection?.word || (editWord ? (editWord.word || editWord) : '');
        const initialScope = editWord && typeof editWord === 'object' ? editWord.scope : 'all';
        const initialTarget = editWord && typeof editWord === 'object' ? editWord.target : '';
        
        const currentRating = type === 'interest' && initialWord ? (window.WordRatingManager?.getWordRating(initialWord) || 0) : 0;
        
        const ratingSection = type === 'interest' ? `
            <div class="word-section">
                <div class="word-section-header">
                    <h3>星評価（任意）</h3>
                    <span style="font-size: 0.9rem; color: #9ca3af;">追加後に変更も可能です</span>
                </div>
                <div class="inline-rating-container" style="margin-bottom: 1rem;">
                    <div class="inline-rating-stars" id="inlineRatingStars" style="display: flex; gap: 0.5rem; justify-content: center; margin-bottom: 0.5rem;">
                        <button type="button" class="inline-star" data-rating="1" style="background:none; border:none; font-size:1.5rem; color:#6b7280; cursor:pointer; padding:0.25rem; transition:color 0.2s; outline:none;">★</button>
                        <button type="button" class="inline-star" data-rating="2" style="background:none; border:none; font-size:1.5rem; color:#6b7280; cursor:pointer; padding:0.25rem; transition:color 0.2s; outline:none;">★</button>
                        <button type="button" class="inline-star" data-rating="3" style="background:none; border:none; font-size:1.5rem; color:#6b7280; cursor:pointer; padding:0.25rem; transition:color 0.2s; outline:none;">★</button>
                        <button type="button" class="inline-star" data-rating="4" style="background:none; border:none; font-size:1.5rem; color:#6b7280; cursor:pointer; padding:0.25rem; transition:color 0.2s; outline:none;">★</button>
                        <button type="button" class="inline-star" data-rating="5" style="background:none; border:none; font-size:1.5rem; color:#6b7280; cursor:pointer; padding:0.25rem; transition:color 0.2s; outline:none;">★</button>
                        <button type="button" class="inline-star-clear" title="評価をクリア" style="background:none; border:none; font-size:1.2rem; color:#ef4444; cursor:pointer; padding:0.25rem; margin-left:0.5rem; outline:none;">×</button>
                    </div>
                    <div class="inline-rating-description" style="font-size: 0.8rem; color: #9ca3af; text-align: center;">
                        <div>1星: 低関心 (+2) | 2星: やや関心 (+4) | 3星: 普通関心 (+6)</div>
                        <div>4星: 高関心 (+8) | 5星: 最高関心 (+10)</div>
                    </div>
                </div>
            </div>
        ` : '';
        
        const modalHtml = `
            <div class="modal-overlay" onclick="handleCloseModal()">
                <div class="modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>${title}</h2>
                        <button class="modal-close" onclick="handleCloseModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="modal-section-group">
                            <h3 class="group-title">${type === 'interest' ? '興味' : 'NG'}ワード設定</h3>
                            
                            <div class="word-section">
                                <div class="word-section-header"><h3>ワード入力</h3></div>
                                <input type="text" id="wordInput" placeholder="${type === 'interest' ? '興味' : 'NG'}ワードを入力してください" class="filter-select" style="width: 100%; margin-bottom: 1rem;" value="${initialWord}">
                            </div>
                            
                            ${ratingSection}
                            
                            <div class="word-section">
                                <div class="word-section-header"><h3>適用範囲</h3></div>
                                <div style="margin-bottom: 1rem;">
                                    <label style="display: block; margin-bottom: 0.5rem; cursor: pointer;">
                                        <input type="radio" name="wordScope" value="all" ${initialScope === 'all' ? 'checked' : ''} onchange="handleWordScopeChange(this.value)" onclick="handleWordScopeChange(this.value)">
                                        <span style="margin-left: 0.5rem;">全体（すべての記事に適用）</span>
                                    </label>
                                    <label style="display: block; margin-bottom: 0.5rem; cursor: pointer;">
                                        <input type="radio" name="wordScope" value="folder" ${initialScope === 'folder' ? 'checked' : ''} onchange="handleWordScopeChange(this.value)" onclick="handleWordScopeChange(this.value)">
                                        <span style="margin-left: 0.5rem;">特定のフォルダのみ</span>
                                    </label>
                                    <label style="display: block; margin-bottom: 0.5rem; cursor: pointer;">
                                        <input type="radio" name="wordScope" value="feed" ${initialScope === 'feed' ? 'checked' : ''} onchange="handleWordScopeChange(this.value)" onclick="handleWordScopeChange(this.value)">
                                        <span style="margin-left: 0.5rem;">特定のフィードのみ</span>
                                    </label>
                                </div>
                            </div>
                            
                            <div class="word-section" id="wordTargetSection" style="display: ${initialScope !== 'all' ? 'block' : 'none'};">
                                <div class="word-section-header"><h3>対象選択</h3></div>
                                <select id="wordTargetSelect" class="filter-select" style="width: 100%; margin-bottom: 1rem;">
                                    <option value="">選択してください</option>
                                    ${initialScope === 'folder' ? folders.map(folder => 
                                        `<option value="${folder}" ${folder === initialTarget ? 'selected' : ''}>${folder}</option>`
                                    ).join('') : ''}
                                    ${initialScope === 'feed' ? feeds.map(feed => 
                                        `<option value="${feed}" ${feed === initialTarget ? 'selected' : ''}>${feed}</option>`
                                    ).join('') : ''}
                                </select>
                            </div>
                            
                            <div class="modal-actions">
                                <button class="action-btn" onclick="handleCloseModal()">キャンセル</button>
                                <button class="action-btn ${type === 'interest' ? 'success' : 'danger'}" onclick="handleSubmitWord('${type}', ${isEdit})">${type === 'interest' ? '興味' : 'NG'}ワードを${isEdit ? '更新' : '追加'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        setTimeout(() => {
            if (type === 'interest') {
                initializeInlineStarEvents();
                if (currentRating > 0) {
                    currentInlineRating = currentRating;
                    selectInlineRating(currentRating);
                }
            }
        }, 100);

        return modalHtml;
    };

    // 統合ワード範囲選択処理
    const handleWordScopeChange = (scope) => {
        const targetSection = document.getElementById('wordTargetSection');
        const targetSelect = document.getElementById('wordTargetSelect');
        
        if (!targetSection || !targetSelect) return;
        
        if (scope === 'all') {
            targetSection.style.display = 'none';
            targetSelect.value = '';
        } else {
            targetSection.style.display = 'block';
            targetSelect.innerHTML = '<option value="">選択してください</option>';
            
            if (scope === 'folder') {
                const folders = [...new Set(window.state.articles.map(article => article.folderName))].sort();
                folders.forEach(folder => {
                    const option = document.createElement('option');
                    option.value = folder;
                    option.textContent = folder;
                    targetSelect.appendChild(option);
                });
            } else if (scope === 'feed') {
                const feeds = [...new Set(window.state.articles.map(article => article.rssSource))].sort();
                feeds.forEach(feed => {
                    const option = document.createElement('option');
                    option.value = feed;
                    option.textContent = feed;
                    targetSelect.appendChild(option);
                });
            }
        }
    };

    // 統合ワード送信処理（モーダル閉じる処理追加版）
    const handleSubmitWord = (type, isEdit = false) => {
        const word = document.getElementById('wordInput').value.trim();
        if (!word) {
            alert(`${type === 'interest' ? '興味' : 'NG'}ワードを入力してください`);
            return;
        }
        
        const scopeRadio = document.querySelector('input[name="wordScope"]:checked');
        if (!scopeRadio) {
            alert('範囲を選択してください');
            return;
        }
        const scope = scopeRadio.value;
        
        let target = null;
        if (scope !== 'all') {
            const targetSelect = document.getElementById('wordTargetSelect');
            target = targetSelect ? targetSelect.value : '';
            
            if (!target || target === '') {
                alert('対象を選択してください');
                return;
            }
        }
        
        window._pendingTextSelection = null;
        
        if (type === 'interest') {
            handleAddInterestWordWithScope(word, scope, target, isEdit, currentInlineRating);
        } else {
            handleAddNGWordWithScope(word, scope, target);
        }
        
        // 【追加】モーダルを閉じる
        window.setState({ showModal: null });
    };

    // 興味ワード範囲付き追加処理（画面更新制御対応版）
    const handleAddInterestWordWithScope = (word, scope, target, isEdit = false, rating = 0) => {
        if (!word?.trim()) return;

        const wordHook = window.DataHooks.useWordFilters();
        const success = wordHook.addInterestWord(word.trim(), scope, target);

        if (success) {
            if (rating > 0 && window.WordRatingManager) {
                window.WordRatingManager.saveWordRating(word.trim(), rating);
            }
            
            // 【修正】記事上からの追加時はモーダルを開かず、記事リストも更新しない
            if (window.state?.showModal === 'settings') {
                window.render(); // 設定モーダルが既に開いている場合のみ全体更新
            } else {
                // 【修正】画面更新は行わず、キーワード強調表示のみ更新
                if (rating > 0) {
                    updateKeywordHighlighting(word.trim(), rating);
                }
                // updateArticleListOnly(); ←この行を削除
            }
            
            if (window.GistSyncManager?.isEnabled) {
                window.GistSyncManager.markAsChanged();
            }
            
            const message = rating > 0 
                ? `「${word}」を興味ワードに追加し、${rating}星で評価しました`
                : `「${word}」を興味ワードに追加しました`;
            showToastNotification(message, 'success');
            
        } else {
            alert('そのワードは既に同じ範囲で登録されています');
        }
    };

    // 興味ワード範囲付き削除処理
    const handleRemoveInterestWordWithScope = (word, scope, target) => {
        if (!confirm(`「${word}」を削除しますか？`)) return;

        const wordHook = window.DataHooks.useWordFilters();
        const success = wordHook.removeInterestWord(word, scope, target || null);

        if (success) {
            // 【追加】星評価も削除し、キーワード強調表示を更新
            if (window.WordRatingManager) {
                window.WordRatingManager.saveWordRating(word, 0);
            }
            updateKeywordHighlighting(word, 0);
            
            window.render();
            // 【修正】画面更新制御: 記事リストは更新しない
            
            if (window.GistSyncManager?.isEnabled) {
                window.GistSyncManager.markAsChanged();
            }
        }
    };

    const handleAddNGWordWithScope = (word, scope, target) => {
        if (!word?.trim()) return;

        const wordHook = window.DataHooks.useWordFilters();
        const success = wordHook.addNGWord(word.trim(), scope, target);

        if (success) {
            // 【修正】記事上からの追加時はモーダルを開かず、記事リストも更新しない
            if (window.state?.showModal === 'settings') {
                window.render(); // 設定モーダルが既に開いている場合のみ全体更新
            }
            // 【修正】画面更新は削除、設定モーダル以外では更新しない
            // updateArticleListOnly(); ←この行を削除
            
            showToastNotification(`「${word}」をNGワードに追加しました`, 'success');
            
            if (window.GistSyncManager?.isEnabled) {
                window.GistSyncManager.markAsChanged();
            }
        } else {
            alert('そのワードは既に同じ範囲で登録されています');
        }
    };

    const handleRemoveNGWordWithScope = (word, scope, target) => {
        if (!confirm(`「${word}」を削除しますか？`)) return;

        const wordHook = window.DataHooks.useWordFilters();
        const success = wordHook.removeNGWord(word, scope, target || null);

        if (success) {
            window.render();
            // 【修正】画面更新制御: 記事リストは更新しない
            
            if (window.GistSyncManager?.isEnabled) {
                window.GistSyncManager.markAsChanged();
            }
        }
    };

    // GitHub同期管理機能（軽量化版）
    window.handleSaveGitHubToken = () => {
        const token = document.getElementById('githubToken').value.trim();
        const gistId = document.getElementById('gistIdInput').value.trim();
        
        if (!token) {
            alert('GitHub Personal Access Tokenを入力してください');
            return;
        }
        
        try {
            if (gistId) {
                if (!/^[a-zA-Z0-9-_]+$/.test(gistId) || gistId.length < 10) {
                    alert('Gist IDの形式が正しくありません');
                    return;
                }
                window.GistSyncManager.init(token, gistId);
                alert('GitHub同期設定を保存しました（既存のGist IDを使用）\n定期同期（1分間隔）が開始されました');
            } else {
                window.GistSyncManager.init(token, null);
                alert('GitHub同期設定を保存しました（新しいGistを作成）\n定期同期（1分間隔）が開始されました');
            }
            
            document.getElementById('githubToken').value = '';
            document.getElementById('gistIdInput').value = '';
            window.render();
        } catch (error) {
            alert('設定の保存に失敗しました: ' + error.message);
        }
    };

    window.handleSyncToCloud = async () => {
        if (!window.GistSyncManager.isEnabled) {
            alert('GitHub同期が設定されていません');
            return;
        }
        
        try {
            const result = await window.GistSyncManager.autoSync('manual');
            if (result.success) {
                alert('データをクラウドに保存しました');
            } else {
                alert('クラウドへの保存に失敗しました: ' + (result.error || result.reason));
            }
        } catch (error) {
            alert('同期処理中にエラーが発生しました: ' + error.message);
        }
    };

    window.handleSyncFromCloud = async () => {
        if (!window.GistSyncManager.isEnabled) {
            alert('GitHub同期が設定されていません');
            return;
        }
        
        window.setState({ isSyncUpdating: true, isBackgroundSyncing: false });
        
        try {
            const cloudData = await window.GistSyncManager.syncFromCloud();
            if (!cloudData) {
                alert('クラウドからデータを取得できませんでした');
                return;
            }
            
            if (cloudData.aiLearning) {
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, cloudData.aiLearning);
                window.DataHooksCache.clear('aiLearning');
            }
            
            if (cloudData.wordFilters) {
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, cloudData.wordFilters);
                window.DataHooksCache.clear('wordFilters');
            }

            if (cloudData.aiLearning?.wordWeights && window.WordRatingManager) {
                const weightToRating = { "-10": 1, "-5": 2, "0": 3, "5": 4, "10": 5 };
                let restoredCount = 0;
                Object.entries(cloudData.aiLearning.wordWeights).forEach(([word, weight]) => {
                    const rating = weightToRating[weight.toString()];
                    if (rating && window.WordRatingManager.saveWordRating(word, rating)) {
                        restoredCount++;
                    }
                });
                
                if (restoredCount > 0) window.render();
            }

            if (cloudData.articleStates) {
                const articlesHook = window.DataHooks.useArticles();
                const currentArticles = articlesHook.articles;
                
                const updatedArticles = currentArticles.map(article => {
                    const state = cloudData.articleStates[article.id];
                    if (state) {
                        return {
                            ...article,
                            readStatus: state.readStatus,
                            readLater: state.readLater,
                            lastModified: state.lastModified || article.lastModified
                        };
                    }
                    return article;
                });
                
                window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
                window.DataHooksCache.clear('articles');
                window.setState({ articles: updatedArticles });
            }

            alert('クラウドからデータを復元しました');

        } catch (error) {
            alert('データの復元に失敗しました: ' + error.message);
        } finally {
            window.setState({ isSyncUpdating: false, isBackgroundSyncing: false });
        }
    };

    window.handleSyncDiagnostic = async () => {
        if (!window.GistSyncManager.isEnabled) {
            alert('GitHub同期が設定されていません');
            return;
        }
        
        try {
            const testResults = await window.GistSyncManager.testSync();
            const passedTests = testResults.tests.filter(t => t.status === 'pass').length;
            const totalTests = testResults.tests.length;
            alert(`同期診断結果: ${passedTests}/${totalTests} 項目が正常です`);
        } catch (error) {
            alert('診断テストエラー: ' + error.message);
        }
    };

    window.handleClearGitHubSettings = () => {
        if (!confirm('GitHub同期設定を解除しますか？\n定期同期も停止されます。')) return;
        
        try {
            if (window.GistSyncManager) {
                window.GistSyncManager.stopPeriodicSync();
            }
            
            localStorage.removeItem('minews_gist_config');
            
            if (window.GistSyncManager) {
                Object.assign(window.GistSyncManager, {
                    token: null,
                    gistId: null,
                    isEnabled: false,
                    lastSyncTime: null,
                    pendingChanges: false
                });
            }
            
            alert('GitHub同期設定を解除しました\n定期同期も停止されました');
            window.render();
        } catch (error) {
            alert('設定の解除に失敗しました: ' + error.message);
        }
    };

    window.handleCopyCurrentGistId = async () => {
        if (!window.GistSyncManager?.gistId) {
            alert('コピーするGist IDが設定されていません');
            return;
        }
        
        try {
            await navigator.clipboard.writeText(window.GistSyncManager.gistId);
            alert('Gist IDをコピーしました');
        } catch (error) {
            const textArea = document.createElement('textarea');
            textArea.value = window.GistSyncManager.gistId;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            alert('Gist IDをコピーしました');
        }
    };

    // データ管理機能
    window.handleExportLearningData = () => {
        const aiHook = window.DataHooks.useAILearning();
        const wordHook = window.DataHooks.useWordFilters();

        const exportData = {
            version: window.CONFIG.DATA_VERSION,
            exportDate: new Date().toISOString(),
            aiLearning: aiHook.aiLearning,
            wordFilters: wordHook.wordFilters
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `minews_learning_data_${new Date().toISOString().split('T')[0]}.json`;
        link.click();

        alert('学習データをエクスポートしました');
    };

    window.handleImportLearningData = (event) => {
        const file = event.target.files;
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importData = JSON.parse(e.target.result);

                if (!importData.aiLearning || !importData.wordFilters) {
                    throw new Error('無効なデータ形式です');
                }

                const aiHook = window.DataHooks.useAILearning();
                const wordHook = window.DataHooks.useWordFilters();

                Object.keys(importData.aiLearning.wordWeights || {}).forEach(word => {
                    const weight = importData.aiLearning.wordWeights[word];
                    const currentWeight = aiHook.aiLearning.wordWeights[word] || 0;
                    const newWeight = Math.max(-60, Math.min(60, currentWeight + weight));
                    aiHook.aiLearning.wordWeights[word] = newWeight;
                });

                (importData.wordFilters.interestWords || []).forEach(word => {
                    wordHook.addInterestWord(word);
                });

                (importData.wordFilters.ngWords || []).forEach(word => {
                    wordHook.addNGWord(word);
                });

                alert('学習データをインポートしました');
                window.render();
            } catch (error) {
                alert('インポートに失敗しました: ' + error.message);
            }
        };

        reader.readAsText(file);
        event.target.value = '';
    };

    // イベントハンドラ（明示的更新フラグ対応版）
    const handleFilterChange = (mode) => {
        window.setState({ viewMode: mode });
        // 【修正】フィルター変更は明示的更新
        window.state.allowArticleUpdate = true;
        updateArticleListOnly();
    };

    const handleRefresh = async () => {
        window.setState({ isLoading: true });
        
        try {
            const rssHook = window.DataHooks.useRSSManager();
            const result = await rssHook.fetchAllFeeds();
            alert(`記事を更新しました（追加: ${result.totalAdded}件、エラー: ${result.totalErrors}件）`);
            
            window.setState({ lastUpdate: new Date() });
            
            if (window.GistSyncManager?.isEnabled) {
                window.GistSyncManager.markAsChanged();
            }
        } catch (error) {
            alert('記事の更新に失敗しました: ' + error.message);
        } finally {
            window.setState({ isLoading: false });
        }
    };

    const handleArticleClick = (event, articleId, actionType) => {
        if (actionType !== 'read') {
            event.preventDefault();
            event.stopPropagation();
        }

        const articlesHook = window.DataHooks.useArticles();
        const article = articlesHook.articles.find(a => a.id === articleId);
        if (!article) return;

        switch (actionType) {
            case 'toggleRead':
                event.preventDefault();
                event.stopPropagation();
                const newReadStatus = article.readStatus === 'read' ? 'unread' : 'read';
                
                articlesHook.updateArticle(articleId, { readStatus: newReadStatus }, { skipRender: true });
                
                const articleCard = document.querySelector(`[data-article-id="${articleId}"]`)?.closest('.article-card');
                const readButton = event.target;
                
                if (articleCard) {
                    articleCard.setAttribute('data-read-status', newReadStatus);
                    readButton.textContent = newReadStatus === 'read' ? '既読' : '未読';
                }

                if (window.GistSyncManager?.isEnabled) {
                    window.GistSyncManager.markAsChanged();
                }
                break;

            case 'readLater':
                event.preventDefault();
                event.stopPropagation();
                
                const newReadLater = !article.readLater;
                
                articlesHook.updateArticle(articleId, { readLater: newReadLater }, { skipRender: true });
                
                const readLaterButton = event.target;
                readLaterButton.setAttribute('data-active', newReadLater);
                readLaterButton.textContent = newReadLater ? '解除' : '後で';

                if (window.GistSyncManager?.isEnabled) {
                    window.GistSyncManager.markAsChanged();
                }
                break;
                
            case 'read':
                if (article.readStatus !== 'read') {
                    articlesHook.updateArticle(articleId, { readStatus: 'read' });
                    if (window.GistSyncManager?.isEnabled) {
                        window.GistSyncManager.markAsChanged();
                    }
                }
                break;
        }
    };

    const handleCloseModal = () => {
        window._pendingTextSelection = null;
        currentInlineRating = 0;
        window.setState({ showModal: null });
    };

    const handleOpenModal = (modalType) => window.setState({ showModal: modalType });

    const handleAddWord = (type) => {
        window.setState({ showModal: `add${type === 'interest' ? 'Interest' : 'NG'}Word` });
    };

    const handleRemoveWord = (wordData, type) => {
        if (typeof wordData === 'string') {
            if (!confirm(`「${wordData}」を削除しますか？`)) return;
            
            const wordHook = window.DataHooks.useWordFilters();
            const success = type === 'interest' 
                ? wordHook.removeInterestWord(wordData)
                : wordHook.removeNGWord(wordData);
                
            if (success) {
                // 【追加】興味ワード削除時は星評価も削除し、キーワード強調表示を更新
                if (type === 'interest' && window.WordRatingManager) {
                    window.WordRatingManager.saveWordRating(wordData, 0);
                    updateKeywordHighlighting(wordData, 0);
                }
                
                window.render();
                // 【修正】画面更新制御: 記事リストは更新しない
                
                if (window.GistSyncManager?.isEnabled) {
                    window.GistSyncManager.markAsChanged();
                }
            }
        } else {
            if (type === 'interest') {
                handleRemoveInterestWordWithScope(wordData.word, wordData.scope, wordData.target);
            } else {
                handleRemoveNGWordWithScope(wordData.word, wordData.scope, wordData.target);
            }
            // 【修正】画面更新制御: 記事リストは更新しない
        }
    };

    // レンダリング（軽量化版）
    const renderNavigation = () => {
        return `
            <nav class="nav">
                <div class="nav-top-row">
                    <div class="nav-left-mobile">
                        <h1><span class="title-mine">Mine</span><span class="title-ws">ws</span></h1>
                        <span class="last-update-mobile">表示中: ${getFilteredArticles().length}件</span>
                    </div>
                    <div class="nav-actions-mobile">
                        <button class="action-btn refresh-btn ${window.state.isLoading ? 'loading' : ''}" onclick="handleRefresh()" ${window.state.isLoading ? 'disabled' : ''}>${window.state.isLoading ? '更新中...' : '記事更新'}</button>
                        <button class="action-btn" onclick="handleOpenModal('settings')">設定</button>
                    </div>
                </div>
                
                <div class="nav-filters-mobile">
                    <div class="filter-row">${renderFolderDropdown('mobile_')}</div>
                    
                    <div class="filter-row">
                        <label for="viewFilterMobile">表示:</label>
                        <select id="viewFilterMobile" name="viewFilterMobile" class="filter-select" onchange="handleFilterChange(this.value)">
                            <option value="all" ${window.state.viewMode === 'all' ? 'selected' : ''}>全て</option>
                            <option value="unread" ${window.state.viewMode === 'unread' ? 'selected' : ''}>未読のみ</option>
                            <option value="read" ${window.state.viewMode === 'read' ? 'selected' : ''}>既読のみ</option>
                            <option value="readLater" ${window.state.viewMode === 'readLater' ? 'selected' : ''}>後で読む</option>
                        </select>
                        <button class="action-btn bulk-read-btn" onclick="handleBulkMarkAsRead()" title="表示中の記事を一括既読">✓</button>
                    </div>
                </div>

                <div class="nav-left desktop-only">
                    <h1><span class="title-mine">Mine</span><span class="title-ws">ws</span></h1>
                    <div class="last-update">表示中: ${getFilteredArticles().length}件</div>
                </div>
                
                <div class="nav-filters desktop-only">
                    <div class="filter-group">${renderFolderDropdown('desktop_')}</div>
                    
                    <div class="filter-group">
                        <label for="viewFilterDesktop">表示:</label>
                        <select id="viewFilterDesktop" name="viewFilterDesktop" class="filter-select" onchange="handleFilterChange(this.value)">
                            <option value="all" ${window.state.viewMode === 'all' ? 'selected' : ''}>全て</option>
                            <option value="unread" ${window.state.viewMode === 'unread' ? 'selected' : ''}>未読のみ</option>
                            <option value="read" ${window.state.viewMode === 'read' ? 'selected' : ''}>既読のみ</option>
                            <option value="readLater" ${window.state.viewMode === 'readLater' ? 'selected' : ''}>後で読む</option>
                        </select>
                        <button class="action-btn bulk-read-btn" onclick="handleBulkMarkAsRead()" title="表示中の記事を一括既読">✓</button>
                    </div>
                </div>

                <div class="nav-actions desktop-only">
                    <button class="action-btn refresh-btn ${window.state.isLoading ? 'loading' : ''}" onclick="handleRefresh()" ${window.state.isLoading ? 'disabled' : ''}>${window.state.isLoading ? '更新中...' : '記事更新'}</button>
                    <button class="action-btn" onclick="handleOpenModal('settings')">設定</button>
                </div>
            </nav>
        `;
    };

    const getFilteredArticles = () => {
        let filtered = [...window.state.articles];

        filtered = filtered.filter(article => 
            window.state.selectedFolders.includes(article.folderName) || 
            window.state.selectedFeeds.includes(article.rssSource)
        );

        const filterSettings = getFilterSettings();
        const aiHook = window.DataHooks.useAILearning();
        const wordHook = window.DataHooks.useWordFilters();
        
        filtered = filtered.filter(article => {
            const aiScore = window.AIScoring.calculateScore(article, aiHook.aiLearning, wordHook.wordFilters);
            return aiScore >= filterSettings.scoreMin && aiScore <= filterSettings.scoreMax;
        });

        const now = new Date();
        filtered = filtered.filter(article => {
            const articleDate = new Date(article.publishDate);
            const daysDiff = Math.floor((now - articleDate) / (1000 * 60 * 60 * 24));
            return daysDiff >= filterSettings.dateMin && daysDiff <= filterSettings.dateMax;
        });

        switch (window.state.viewMode) {
            case 'unread':
                filtered = filtered.filter(article => article.readStatus === 'unread' && !article.readLater);
                break;
            case 'read':
                filtered = filtered.filter(article => article.readStatus === 'read');
                break;
            case 'readLater':
                filtered = filtered.filter(article => article.readLater);
                break;
        }

        filtered = window.WordFilterManager.filterArticles(filtered, wordHook.wordFilters);

        if (window.state.isSyncUpdating && !window.state.isBackgroundSyncing) {
            return filtered;
        }

        const articlesWithScores = filtered.map(article => ({
            ...article,
            aiScore: window.AIScoring.calculateScore(article, aiHook.aiLearning, wordHook.wordFilters)
        }));

        return articlesWithScores.sort((a, b) => {
            if (a.aiScore !== b.aiScore) return b.aiScore - a.aiScore;
            const dateCompare = new Date(b.publishDate) - new Date(a.publishDate);
            if (dateCompare !== 0) return dateCompare;
            return a.id.localeCompare(b.id);
        });
    };

    const renderArticleCard = (article) => {
        const keywords = (article.keywords || []).map(keyword => {
            const sanitizedKeyword = keyword.replace(/[<>"'&]/g, match => {
                const escapeChars = { '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' };
                return escapeChars[match];
            });
            
            const rating = window.WordRatingManager?.getWordRating(keyword) || 0;
            const ratingClass = rating > 0 ? `rated-${rating}` : '';
            
            return `
                <span class="keyword ${ratingClass}" onclick="showKeywordSelectionMenu('${keyword.replace(/'/g, "\\'")}', event)" title="クリックして操作 (現在: ${rating > 0 ? rating + '星' : '未評価'})">
                    ${sanitizedKeyword}${rating > 0 ? ` ★${rating}` : ''}
                </span>
            `;
        }).join('');

        return `
            <div class="article-card" data-read-status="${article.readStatus}">
                <div class="article-header">
                    <h3 class="article-title">
                        <a href="${article.url}" target="_blank" rel="noopener noreferrer" onclick="handleArticleClick(event, '${article.id}', 'read')" onauxclick="handleArticleClick(event, '${article.id}', 'read')">
                            ${article.title}
                        </a>
                    </h3>
                    
                    <div class="article-meta">
                        <span class="date">${window.formatDate(article.publishDate)}</span>
                        <span class="source">${article.rssSource}</span>
                        <span class="ai-score">AI: ${article.aiScore || 0}</span>
                    </div>
                </div>

                <div class="article-content">${window.truncateText(article.content)}</div>

                ${keywords ? `<div class="article-keywords">${keywords}</div>` : ''}

                <div class="article-actions">
                    <button class="simple-btn read-status" onclick="handleArticleClick(event, '${article.id}', 'toggleRead')" data-article-id="${article.id}">
                        ${article.readStatus === 'read' ? '既読' : '未読'}
                    </button>
                    <button class="simple-btn read-later" data-active="${article.readLater}" onclick="handleArticleClick(event, '${article.id}', 'readLater')" data-article-id="${article.id}">
                        ${article.readLater ? '解除' : '後で'}
                    </button>
                </div>
            </div>
        `;
    };

    const renderArticleList = () => {
        const articles = getFilteredArticles();

        if (articles.length === 0) {
            return '<div class="empty-message">表示する記事がありません</div>';
        }

        return `<div class="article-grid">${articles.map(renderArticleCard).join('')}</div>`;
    };

    const renderSettingsModal = () => {
        const storageInfo = window.LocalStorageManager.getStorageInfo();
        const wordHook = window.DataHooks.useWordFilters();
        const filterSettings = getFilterSettings();
        
        const interestWords = wordHook.wordFilters.interestWords.map(wordObj => {
            const word = typeof wordObj === 'string' ? wordObj : wordObj.word;
            const scope = typeof wordObj === 'string' ? 'all' : wordObj.scope;
            const target = typeof wordObj === 'string' ? null : wordObj.target;
            
            const rating = window.WordRatingManager?.getWordRating(word) || 0;
            const ratingClass = rating > 0 ? `rated-${rating}` : '';
            
            const scopeText = scope === 'all' ? '' : 
                             scope === 'folder' ? ` [フォルダ: ${target}]` :
                             ` [フィード: ${target}]`;
            
            return `
                <span class="word-tag interest ${ratingClass}" onclick="showWordRatingModal('${word.replace(/'/g, "\\'")}', 'interest'); event.stopPropagation();" title="クリックして評価 (現在: ${rating > 0 ? rating + '星' : '未評価'})">
                    ${word}${rating > 0 ? ` ★${rating}` : ''}${scopeText}
                    <button class="word-remove" onclick="handleRemoveWord(${JSON.stringify(wordObj).replace(/"/g, '&quot;')}, 'interest'); event.stopPropagation()">×</button>
                </span>
            `;
        }).join('');

        const ngWords = wordHook.wordFilters.ngWords.map(ngWordObj => {
            if (typeof ngWordObj === 'string') {
                return `<span class="word-tag ng">
                    ${ngWordObj} <span class="word-scope">[全体]</span>
                    <button class="word-remove" onclick="handleRemoveWord('${ngWordObj}', 'ng')">×</button>
                </span>`;
            } else {
                const scopeText = ngWordObj.scope === 'all' ? '全体' : 
                                 ngWordObj.scope === 'folder' ? `フォルダ: ${ngWordObj.target}` :
                                 `フィード: ${ngWordObj.target}`;
                return `<span class="word-tag ng">
                    ${ngWordObj.word} <span class="word-scope">[${scopeText}]</span>
                    <button class="word-remove" onclick="handleRemoveNGWordWithScope('${ngWordObj.word}', '${ngWordObj.scope}', '${ngWordObj.target || ''}')">×</button>
                </span>`;
            }
        }).join('');
        
        return `
            <div class="modal-overlay" onclick="handleCloseModal()">
                <div class="modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>設定</h2>
                        <button class="modal-close" onclick="handleCloseModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="modal-section-group">
                            <h3 class="group-title">記事フィルター設定</h3>
                            
                            <div class="word-section">
                                <div class="word-section-header">
                                    <h3>AIスコア範囲</h3>
                                    <span class="filter-range-display">${filterSettings.scoreMin}点 - ${filterSettings.scoreMax}点</span>
                                </div>
                                <div class="slider-container">
                                    <label>最小スコア: <span id="scoreMinValue">${filterSettings.scoreMin}</span>点</label>
                                    <input type="range" id="scoreMinSlider" min="0" max="100" value="${filterSettings.scoreMin}" oninput="updateScoreDisplay('min', this.value)" class="filter-slider">
                                    
                                    <label>最大スコア: <span id="scoreMaxValue">${filterSettings.scoreMax}</span>点</label>
                                    <input type="range" id="scoreMaxSlider" min="0" max="100" value="${filterSettings.scoreMax}" oninput="updateScoreDisplay('max', this.value)" class="filter-slider">
                                </div>
                            </div>

                            <div class="word-section">
                                <div class="word-section-header">
                                    <h3>記事日付範囲</h3>
                                    <span class="filter-range-display">${filterSettings.dateMin}日前 - ${filterSettings.dateMax}日前</span>
                                </div>
                                <div class="slider-container">
                                    <label>最新: <span id="dateMinValue">${filterSettings.dateMin}</span>日前</label>
                                    <input type="range" id="dateMinSlider" min="0" max="14" value="${filterSettings.dateMin}" oninput="updateDateDisplay('min', this.value)" class="filter-slider">
                                    
                                    <label>最古: <span id="dateMaxValue">${filterSettings.dateMax}</span>日前</label>
                                    <input type="range" id="dateMaxSlider" min="0" max="14" value="${filterSettings.dateMax}" oninput="updateDateDisplay('max', this.value)" class="filter-slider">
                                </div>
                            </div>

                            <div class="modal-actions">
                                <button class="action-btn" onclick="resetFilterSettings()">フィルターをリセット</button>
                                <button class="action-btn success" onclick="applyFilterSettings()">設定を適用</button>
                            </div>
                        </div>
                        
                        <div class="modal-section-group">
                            <h3 class="group-title">クラウド同期</h3>
                            <div class="word-section">
                                <div class="word-section-header"><h3>GitHub同期設定</h3></div>
                                
                                <p class="text-muted mb-3">
                                    同期状態: ${window.GistSyncManager?.isEnabled ? '有効' : '無効'}<br>
                                    ${window.GistSyncManager?.gistId ? `Gist ID: ${window.GistSyncManager.gistId}` : ''}
                                    ${window.GistSyncManager?.isEnabled && window.GistSyncManager?.lastSyncTime ? 
                                        `<br>Last update: ${formatLastSyncTime(window.GistSyncManager.lastSyncTime)}` : 
                                        ''}
                                </p>
                                
                                ${window.GistSyncManager?.isEnabled ? `
                                    <div style="margin-bottom: 1rem; padding: 0.75rem; background: #374151; border-radius: 6px;">
                                        <div style="color: #9ca3af; font-size: 0.9rem; margin-bottom: 0.75rem;">GitHub同期は設定済みです。定期同期（1分間隔）が実行中。</div>
                                        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                                            <button class="action-btn danger" onclick="handleClearGitHubSettings()" style="font-size: 0.85rem;">設定を解除</button>
                                            <button class="action-btn" onclick="handleCopyCurrentGistId()" style="font-size: 0.85rem;">Gist IDコピー</button>
                                        </div>
                                    </div>
                                    
                                    <div class="modal-actions">
                                        <button class="action-btn" onclick="handleSyncToCloud()">手動バックアップ</button>
                                        <button class="action-btn" onclick="handleSyncFromCloud()">クラウドから復元</button>
                                        <button class="action-btn" onclick="handleSyncDiagnostic()">同期診断</button>
                                    </div>
                                ` : `
                                    <div class="modal-actions">
                                        <div style="margin-bottom: 1rem;">
                                            <label for="githubToken" style="display: block; font-weight: 600; margin-bottom: 0.5rem; color: #e2e8f0;">GitHub Personal Access Token</label>
                                            <input type="password" id="githubToken" name="githubToken" placeholder="GitHub Personal Access Tokenを入力" class="filter-select" style="width: 100%;">
                                        </div>
                                        
                                        <div style="margin-bottom: 1rem;">
                                            <label for="gistIdInput" style="display: block; font-weight: 600; margin-bottom: 0.5rem; color: #e2e8f0;">既存のGist ID（任意）</label>
                                            <input type="text" id="gistIdInput" name="gistIdInput" placeholder="他のデバイスと同期する場合のみ入力" class="filter-select" style="width: 100%; font-family: monospace;">
                                        </div>
                                        
                                        <button class="action-btn success" onclick="handleSaveGitHubToken()" style="width: 100%; padding: 0.75rem;">GitHub同期を開始</button>
                                    </div>
                                `}
                            </div>
                        </div>
                        
                        <div class="modal-section-group">
                            <h3 class="group-title">【修正統合】ワード評価設定（既存興味ワード削除確認統合版 + 画面更新制御版）</h3>
                            <div class="word-section">
                                <div class="word-section-header">
                                    <h3>興味ワード（クリックで星評価設定）</h3>
                                    <button class="action-btn success" onclick="handleAddWord('interest')">追加</button>
                                </div>
                                <div class="word-list">
                                    ${interestWords || '<div class="text-muted">設定されていません</div>'}
                                </div>
                            </div>

                            <div class="word-section">
                                <div class="word-section-header">
                                    <h3>NGワード</h3>
                                    <button class="action-btn danger" onclick="handleAddWord('ng')">追加</button>
                                </div>
                                <div class="word-list">
                                    ${ngWords || '<div class="text-muted">設定されていません</div>'}
                                </div>
                            </div>

                            <div class="word-help">
                               <h4>【修正統合】ワード評価システム + テキスト選択機能 + 適用範囲設定 + キーワード選択UI統一 + 既存興味ワード削除確認 + 画面更新制御</h4>
                                <ul>
                                    <li><strong>興味ワード:</strong> 該当する記事のAIスコアが上がります（星評価でボーナス加算 + 適用範囲選択可能 + 追加時に同画面で星評価）</li>
                                    <li><strong>記事キーワード:</strong> 記事内のキーワードをクリックして興味ワード追加・削除・NGワードの操作メニューを表示</li>
                                    <li><strong>テキスト選択:</strong> 記事内の文字を選択して右クリックメニューから範囲指定で追加可能</li>
                                    <li><strong>自動統合:</strong> 評価したキーワードは自動的に興味ワードに追加されます</li>
                                    <li><strong>NGワード:</strong> 該当する記事は表示されません（適用範囲選択可能）</li>
                                    <li><strong>適用範囲:</strong> 全体・フォルダ別・フィード別で細かく設定可能</li>
                                    <li><strong>UI統一:</strong> キーワード選択とテキスト選択で同じ操作フローを提供</li>
                                    <li><strong>削除確認:</strong> 既存興味ワードをクリックした場合は削除確認ダイアログを表示</li>
                                    <li><strong>画面更新制御:</strong> 基本的に各種変更を加えても表示が更新されず、明示的操作時のみ並び替えが実行されます</li>
                                </ul>
                            </div>
                        </div>

                        <div class="modal-section-group">
                            <h3 class="group-title">データ管理</h3>
                            <div class="word-section">
                                <div class="word-section-header"><h3>学習データ管理</h3></div>
                                <div class="modal-actions">
                                    <button class="action-btn success" onclick="handleExportLearningData()">学習データエクスポート</button>
                                    <label class="action-btn" style="cursor: pointer; display: inline-block;">
                                        学習データインポート
                                        <input type="file" accept=".json" onchange="handleImportLearningData(event)" style="display: none;">
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div class="modal-section-group">
                            <h3 class="group-title">システム情報</h3>
                            <div class="word-section">
                                <div class="word-section-header"><h3>ストレージ使用量</h3></div>
                                <div class="word-list" style="flex-direction: column; align-items: flex-start;">
                                    <p class="text-muted" style="margin: 0;">
                                        使用量: ${Math.round(storageInfo.totalSize / 1024)}KB / 5MB<br>
                                        アイテム数: ${storageInfo.itemCount}
                                    </p>
                                </div>
                            </div>

                            <div class="word-section">
                                <div class="word-section-header"><h3>バージョン情報</h3></div>
                                <div class="word-list" style="flex-direction: column; align-items: flex-start;">
                                    <p class="text-muted" style="margin: 0;">
                                        Minews PWA v${window.CONFIG.DATA_VERSION}<br>
                                        【修正統合】既存興味ワード削除確認統合版 + 画面更新制御版
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    const renderModal = () => {
        switch (window.state.showModal) {
            case 'settings': return renderSettingsModal();
            case 'addInterestWord': return renderWordSettingModal('interest');
            case 'addNGWord': return renderWordSettingModal('ng');
            default: return '';
        }
    };

    // メインレンダー関数（修正版）
    window.render = () => {
        const app = document.getElementById('app');
        if (!app) return;

        app.innerHTML = `
            <div class="app">
                ${renderNavigation()}
                <main class="main-content">${renderArticleList()}</main>
                ${renderModal()}
            </div>
        `;
        
        // モーダルが表示された後にイベントを初期化
        setTimeout(() => {
            if (window.state.showModal === 'addInterestWord') {
                initializeInlineStarEvents();
            }
        }, 50);
    };

    // グローバル関数の追加（既存興味ワード削除確認統合版 + 画面更新制御版）
    Object.assign(window, {
        handleFilterChange, handleRefresh, handleArticleClick, handleCloseModal, handleOpenModal,
        handleAddWord, handleRemoveWord, initializeGistSync, handleFolderToggle, handleFeedToggle,
        handleSelectAllFolders, toggleFolderDropdown, handleBulkMarkAsRead,
        updateScoreDisplay, updateDateDisplay, applyFilterSettings, resetFilterSettings, getFilterSettings,
        handleAddNGWordWithScope, handleRemoveNGWordWithScope, handleAddInterestWordWithScope, handleRemoveInterestWordWithScope,
        handleWordScopeChange, handleSubmitWord, showWordRatingModal, closeWordRatingModal, 
        highlightStars, resetStars, selectWordRating, showToastNotification, TextSelectionManager,
        // キーワード選択関連（修正統合版）
        showKeywordSelectionMenu, handleKeywordAsInterestWord, handleKeywordAsNGWord, handleKeywordRemoveFromInterest,
        // インライン星評価関連（修正版）
        initializeInlineStarEvents, highlightInlineStars, resetInlineStars, selectInlineRating,
        // ★追加：キーワード強調表示更新関数
        updateKeywordHighlighting
    });

    // 初期化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initializeData();
            initializeGistSync();
            TextSelectionManager.init();
            window.render();
        });
    } else {
        initializeData();
        initializeGistSync();
        TextSelectionManager.init();
        window.render();
    }

})();
