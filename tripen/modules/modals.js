const createModalEntry = (title, body, footer, size = '') => ({
    id: `modal-${Date.now()}`,
    title,
    body,
    footer,
    size
});

export const openModal = (context, title, body, footer, size) => {
    const modal = createModalEntry(title, body, footer, size);
    context.modals.push(modal);

    context.$nextTick(() => {
        const modalElement = document.getElementById(modal.id);
        if (!modalElement) return;
        const bootstrapModal = new bootstrap.Modal(modalElement);
        bootstrapModal.show();
        modalElement.addEventListener('hidden.bs.modal', () => {
            const index = context.modals.findIndex(m => m.id === modal.id);
            if (index !== -1) context.modals.splice(index, 1);
        });
    });
};

export const closeAllModals = context => {
    context.modals.forEach(modal => {
        const element = document.getElementById(modal.id);
        const instance = bootstrap.Modal.getInstance(element);
        instance?.hide();
    });
    context.modals = [];
};

export const buildEventModalBody = (tripDays, eventForm) => `
    <div class="mb-3">
        <label for="eventTitle" class="form-label">予定タイトル</label>
        <input type="text" class="form-control" id="eventTitle" value="${eventForm.title.replace(/"/g, '&quot;')}" placeholder="予定のタイトルを入力">
    </div>
    <div class="mb-3">
        <label for="eventDay" class="form-label">日程</label>
        <select class="form-select" id="eventDay">
            ${tripDays.map((day, index) =>
                `<option value="${index}" ${eventForm.dayIndex === index ? 'selected' : ''}>${day.dayNumber}日目 (${day.date})</option>`
            ).join('')}
        </select>
    </div>
    <div class="row">
        <div class="col-md-6">
            <div class="mb-3">
                <label for="eventStartTime" class="form-label">開始時間</label>
                <input type="time" class="form-control" id="eventStartTime" value="${eventForm.startTime}" min="04:00" max="23:59">
            </div>
        </div>
        <div class="col-md-6">
            <div class="mb-3">
                <label for="eventEndTime" class="form-label">終了時間</label>
                <input type="time" class="form-control" id="eventEndTime" value="${eventForm.endTime}" min="04:00" max="24:00">
            </div>
        </div>
    </div>
    <div class="mb-3">
        <label for="eventCategory" class="form-label">カテゴリ</label>
        <select class="form-select" id="eventCategory">
            <option value="travel" ${eventForm.category === 'travel' ? 'selected' : ''}>🚗 移動</option>
            <option value="food" ${eventForm.category === 'food' ? 'selected' : ''}>🍽️ 食事</option>
            <option value="sightseeing" ${eventForm.category === 'sightseeing' ? 'selected' : ''}>📸 観光</option>
            <option value="accommodation" ${eventForm.category === 'accommodation' ? 'selected' : ''}>🏨 宿泊</option>
            <option value="custom" ${eventForm.category === 'custom' ? 'selected' : ''}>⭐ その他</option>
        </select>
    </div>
    <div class="mb-3">
        <label for="eventCoordinates" class="form-label">緯度経度 (オプション)</label>
        <div class="input-group">
            <input type="text" class="form-control" id="eventCoordinates" value="${eventForm.coordinates.replace(/"/g, '&quot;')}" placeholder="例: 34.702485,135.495951">
            <button class="btn btn-outline-secondary" type="button" onclick="window.app.setLocationFromMap()" title="地図から選択">🗾</button>
            <button class="btn btn-outline-secondary" type="button" onclick="window.app.copyCoordinates()" title="コピー">📋</button>
        </div>
        <div class="form-text">地図から位置を選択するか、緯度,経度の形式で入力してください</div>
    </div>
    <div class="mb-3">
        <label for="eventDescription" class="form-label">詳細 (オプション)</label>
        <textarea class="form-control" id="eventDescription" rows="3" placeholder="予定の詳細を入力">${eventForm.description.replace(/"/g, '&quot;')}</textarea>
    </div>
`;

export const buildEventModalFooter = isEdit => `
    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">キャンセル</button>
    <button type="button" class="btn btn-primary" onclick="window.app.saveEvent(${isEdit})">${isEdit ? '更新' : '追加'}</button>
`;
