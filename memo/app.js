import { dataManager } from './dataManager.js';
import { uiManager } from './uiManager.js';

document.addEventListener('DOMContentLoaded', () => {
    const quill = new Quill('#editor-container', {
        theme: 'snow',
        modules: {
            toolbar: [
                ['bold', 'italic'],
                [{ 'color': [] }, { 'size': ['small', false, 'large', 'huge'] }],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }, { 'list': 'check' }],
                ['link', 'blockquote']
            ]
        }
    });

    (async () => {
        await dataManager.init();
        uiManager.init(quill);
    })();
});