const App = (() => {
  let masterKey = null;
  let vaultData = null;
  let currentType = 'all';
  let searchQuery = '';
  let currentEntryType = 'password';

  const TYPES = [
    { id: 'password', name: '应用软件密码', icon: '🔑', color: '#34d399' },
    { id: 'bank', name: '银行卡信息', icon: '💳', color: '#60a5fa' },
    { id: 'bill', name: '账单地址信息', icon: '📍', color: '#f472b6' }
  ];

  function init() {
    if (Storage.hasVault()) {
      showLoginPage(false);
    } else {
      showLoginPage(true);
    }
    bindEvents();
  }

  function showLoginPage(isFirstTime) {
    document.getElementById('login-page').style.display = 'block';
    document.getElementById('main-page').style.display = 'none';
    
    const subtitle = document.getElementById('login-subtitle');
    const confirmGroup = document.getElementById('confirm-password-group');
    const warning = document.getElementById('login-warning');
    const btnText = document.getElementById('login-btn-text');
    
    if (isFirstTime) {
      subtitle.textContent = '设置您的主密码';
      confirmGroup.style.display = 'block';
      warning.style.display = 'flex';
      btnText.textContent = '设置主密码';
    } else {
      subtitle.textContent = '请输入主密码解锁';
      confirmGroup.style.display = 'none';
      warning.style.display = 'none';
      btnText.textContent = '解锁';
    }

    const importBtn = document.getElementById('login-import-btn');
    if (importBtn) importBtn.style.display = isFirstTime ? 'block' : 'none';

    document.getElementById('master-password').value = '';
    const confirmInput = document.getElementById('confirm-password');
    if (confirmInput) confirmInput.value = '';
    document.getElementById('login-error').style.display = 'none';
    document.getElementById('master-password').focus();
  }

  async function handleLogin() {
    const password = document.getElementById('master-password').value;
    const isFirstTime = !Storage.hasVault();
    const errorEl = document.getElementById('login-error');
    
    if (!password) {
      showError(errorEl, '请输入主密码');
      return;
    }
    
    if (isFirstTime) {
      const confirmPassword = document.getElementById('confirm-password').value;
      if (!confirmPassword) {
        showError(errorEl, '请再次输入主密码');
        return;
      }
      if (password !== confirmPassword) {
        showError(errorEl, '两次输入的密码不一致');
        return;
      }
      if (password.length < 6) {
        showError(errorEl, '主密码至少6位');
        return;
      }
      
      await createVault(password);
      unlockSuccess();
    } else {
      try {
        await unlockVault(password);
        unlockSuccess();
      } catch (e) {
        showError(errorEl, e.message || '密码错误');
      }
    }
  }

  async function createVault(password) {
    const salt = CryptoUtil.generateSalt();
    const key = await CryptoUtil.deriveKey(password, salt);
    
    vaultData = {
      entries: [],
      settings: { theme: 'light' }
    };
    
    const jsonStr = JSON.stringify(vaultData);
    const encrypted = await CryptoUtil.encryptData(jsonStr, key);
    
    const vault = {
      v: 1,
      salt: salt,
      iterations: CryptoUtil.ITERATIONS,
      iv: encrypted.iv,
      data: encrypted.data
    };
    
    Storage.saveEncryptedData(vault);
    masterKey = key;
  }

  async function unlockVault(password) {
    const encrypted = Storage.loadEncryptedData();
    if (!encrypted) {
      throw new Error('未找到密码库');
    }
    
    const key = await CryptoUtil.deriveKey(password, encrypted.salt, encrypted.iterations);
    
    try {
      const decrypted = await CryptoUtil.decryptData(encrypted.data, encrypted.iv, key);
      vaultData = JSON.parse(decrypted);
      masterKey = key;
    } catch (e) {
      throw new Error('主密码错误');
    }
  }

  function unlockSuccess() {
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('main-page').style.display = 'block';
    currentType = 'all';
    renderCategories();
    renderEntries();
  }

  function lockVault() {
    masterKey = null;
    vaultData = null;
    showLoginPage(false);
  }

  async function saveVault() {
    if (!masterKey || !vaultData) return;
    
    const jsonStr = JSON.stringify(vaultData);
    const encrypted = await CryptoUtil.encryptData(jsonStr, masterKey);
    
    const existing = Storage.loadEncryptedData();
    const vault = {
      v: 1,
      salt: existing.salt,
      iterations: existing.iterations,
      iv: encrypted.iv,
      data: encrypted.data
    };
    
    Storage.saveEncryptedData(vault);
  }

  function renderCategories() {
    const list = document.getElementById('category-list');
    const entries = vaultData?.entries || [];
    
    const allCount = entries.length;
    
    let html = `
      <li class="category-item ${currentType === 'all' ? 'active' : ''}" data-type="all">
        <span class="category-icon">📋</span>
        <span class="category-name">全部</span>
        <span class="category-count">${allCount}</span>
      </li>
    `;
    
    TYPES.forEach(type => {
      const count = entries.filter(e => e.type === type.id).length;
      html += `
        <li class="category-item ${currentType === type.id ? 'active' : ''}" data-type="${type.id}">
          <span class="category-icon">${type.icon}</span>
          <span class="category-name">${type.name}</span>
          <span class="category-count">${count}</span>
        </li>
      `;
    });
    
    list.innerHTML = html;
    
    list.querySelectorAll('.category-item').forEach(item => {
      item.addEventListener('click', () => {
        currentType = item.dataset.type;
        renderCategories();
        renderEntries();
      });
    });
  }

  function renderEntries() {
    const grid = document.getElementById('password-grid');
    const emptyState = document.getElementById('empty-state');
    const countBadge = document.getElementById('entry-count');
    const titleEl = document.getElementById('current-category-title');
    
    let entries = vaultData?.entries || [];
    
    if (currentType !== 'all') {
      entries = entries.filter(e => e.type === currentType);
      const typeInfo = TYPES.find(t => t.id === currentType);
      titleEl.textContent = typeInfo ? typeInfo.name : '全部';
    } else {
      titleEl.textContent = '全部';
    }
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      entries = entries.filter(e => {
        if (e.title && e.title.toLowerCase().includes(q)) return true;
        if (e.type === 'password') {
          if (e.username && e.username.toLowerCase().includes(q)) return true;
          if (e.url && e.url.toLowerCase().includes(q)) return true;
        }
        if (e.type === 'bank') {
          if (e.bankName && e.bankName.toLowerCase().includes(q)) return true;
          if (e.holder && e.holder.toLowerCase().includes(q)) return true;
        }
        if (e.type === 'bill') {
          if (e.lastName && e.lastName.toLowerCase().includes(q)) return true;
          if (e.firstName && e.firstName.toLowerCase().includes(q)) return true;
          if (e.phone && e.phone.toLowerCase().includes(q)) return true;
          if (e.city && e.city.toLowerCase().includes(q)) return true;
        }
        return false;
      });
    }
    
    countBadge.textContent = `${entries.length} 条`;
    
    if (entries.length === 0) {
      grid.innerHTML = '';
      emptyState.style.display = 'block';
      const emptyDesc = emptyState.querySelector('.empty-desc');
      if (emptyDesc) emptyDesc.textContent = '点击右上角「➕」添加第一条记录';
      return;
    }
    
    emptyState.style.display = 'none';
    
    entries.sort((a, b) => b.updatedAt - a.updatedAt);
    
    let html = '';
    entries.forEach(entry => {
      const typeInfo = TYPES.find(t => t.id === entry.type) || TYPES[0];
      
      if (entry.type === 'password') {
        html += renderPasswordCard(entry, typeInfo);
      } else if (entry.type === 'bank') {
        html += renderBankCard(entry, typeInfo);
      } else if (entry.type === 'bill') {
        html += renderBillCard(entry, typeInfo);
      }
    });
    
    grid.innerHTML = html;
    
    grid.querySelectorAll('.password-card').forEach(card => {
      const id = card.dataset.id;
      
      const editBtn = card.querySelector('[data-action="edit"]');
      const copyBtn = card.querySelector('[data-action="copy"]');
      
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openEntryModal(id);
        });
      }
      
      if (copyBtn) {
        copyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const entry = vaultData.entries.find(e => e.id === id);
          if (entry) {
            let copyText = '';
            if (entry.type === 'password') {
              copyText = entry.password || '';
            } else if (entry.type === 'bank') {
              copyText = entry.cardNumber || '';
            } else if (entry.type === 'bill') {
              const addrParts = [entry.line1, entry.line2, entry.city, entry.state, entry.zip, entry.country].filter(Boolean);
              copyText = addrParts.join(', ');
            }
            if (copyText) {
              copyToClipboard(copyText);
              showToast('已复制到剪贴板', 'success');
            }
          }
        });
      }
      
      card.addEventListener('click', () => {
        openEntryModal(id);
      });
    });
  }

  function renderPasswordCard(entry, typeInfo) {
    return `
      <div class="password-card" data-id="${entry.id}" data-type="password">
        <div class="card-actions">
          <button class="card-action-btn" data-action="copy" title="复制密码">📋</button>
          <button class="card-action-btn" data-action="edit" title="编辑">✏️</button>
        </div>
        <div class="card-header">
          <div class="card-icon" style="background: ${typeInfo.color}20;">${typeInfo.icon}</div>
          <div style="flex: 1; min-width: 0;">
            <div class="card-title">${escapeHtml(entry.title)}</div>
            <div class="card-url">${escapeHtml(entry.username || '-')}</div>
          </div>
        </div>
        <div class="card-account">
          <div style="min-width: 0; flex: 1;">
            <div class="card-account-label">密码</div>
            <div class="card-account-value">••••••••</div>
          </div>
        </div>
        <div class="card-category"><span class="card-category-icon">${typeInfo.icon}</span>${typeInfo.name}</div>
      </div>
    `;
  }

  function renderBankCard(entry, typeInfo) {
    return `
      <div class="password-card" data-id="${entry.id}" data-type="bank">
        <div class="card-actions">
          <button class="card-action-btn" data-action="copy" title="复制卡号">📋</button>
          <button class="card-action-btn" data-action="edit" title="编辑">✏️</button>
        </div>
        <div class="card-header">
          <div class="card-icon" style="background: ${typeInfo.color}20;">${typeInfo.icon}</div>
          <div style="flex: 1; min-width: 0;">
            <div class="card-title">${escapeHtml(entry.title)}</div>
            <div class="card-url">${escapeHtml(entry.bankName || '银行卡')}</div>
          </div>
        </div>
        <div class="card-account">
          <div style="min-width: 0; flex: 1;">
            <div class="card-account-label">卡号</div>
            <div class="card-account-value">${formatCardNumber(entry.cardNumber)}</div>
          </div>
        </div>
        <div class="card-category"><span class="card-category-icon">${typeInfo.icon}</span>${typeInfo.name}</div>
      </div>
    `;
  }

  function renderBillCard(entry, typeInfo) {
    const fullName = (entry.lastName || '') + (entry.firstName || '');
    const address = [entry.line1, entry.city, entry.state].filter(Boolean).join(', ');
    
    return `
      <div class="password-card" data-id="${entry.id}" data-type="bill">
        <div class="card-actions">
          <button class="card-action-btn" data-action="copy" title="复制地址">📋</button>
          <button class="card-action-btn" data-action="edit" title="编辑">✏️</button>
        </div>
        <div class="card-header">
          <div class="card-icon" style="background: ${typeInfo.color}20;">${typeInfo.icon}</div>
          <div style="flex: 1; min-width: 0;">
            <div class="card-title">${escapeHtml(entry.title)}</div>
            <div class="card-url">${escapeHtml(fullName || '地址信息')}</div>
          </div>
        </div>
        <div class="card-account">
          <div style="min-width: 0; flex: 1;">
            <div class="card-account-label">电话</div>
            <div class="card-account-value">${escapeHtml(entry.phone || '-')}</div>
          </div>
        </div>
        <div class="card-address-preview" style="margin-top: 8px; font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
          ${escapeHtml(address || '暂无地址信息')}
        </div>
        <div class="card-category"><span class="card-category-icon">${typeInfo.icon}</span>${typeInfo.name}</div>
      </div>
    `;
  }

  function formatCardNumber(num) {
    if (!num) return '•••• •••• •••• ••••';
    const clean = num.replace(/\s/g, '');
    if (clean.length <= 8) return clean;
    return clean.slice(0, 4) + ' **** **** ' + clean.slice(-4);
  }

  function openEntryModal(id = null, type = null) {
    const modal = document.getElementById('entry-modal');
    const form = document.getElementById('entry-form');
    const titleEl = document.getElementById('entry-modal-title');
    const deleteBtn = document.getElementById('delete-entry-btn');
    
    form.reset();
    document.getElementById('entry-id').value = '';
    document.getElementById('password-options').style.display = 'none';
    
    if (id) {
      const entry = vaultData.entries.find(e => e.id === id);
      if (entry) {
        currentEntryType = entry.type;
        titleEl.textContent = '编辑' + TYPES.find(t => t.id === entry.type)?.name || '条目';
        deleteBtn.style.display = 'block';
        document.getElementById('entry-id').value = entry.id;
        document.getElementById('entry-title').value = entry.title || '';
        
        if (entry.type === 'password') {
          document.getElementById('entry-username').value = entry.username || '';
          document.getElementById('entry-password').value = entry.password || '';
          document.getElementById('entry-url').value = entry.url || '';
        } else if (entry.type === 'bank') {
          document.getElementById('bank-holder').value = entry.holder || '';
          document.getElementById('bank-number').value = entry.cardNumber || '';
          document.getElementById('bank-name').value = entry.bankName || '';
          document.getElementById('bank-pin').value = entry.pin || '';
          document.getElementById('bank-cvv').value = entry.cvv || '';
          document.getElementById('bank-expiry').value = entry.expiry || '';
          document.getElementById('bank-branch').value = entry.branch || '';
        } else if (entry.type === 'bill') {
          document.getElementById('addr-lastname').value = entry.lastName || '';
          document.getElementById('addr-firstname').value = entry.firstName || '';
          document.getElementById('addr-gender').value = entry.gender || '';
          document.getElementById('addr-age').value = entry.age || '';
          document.getElementById('addr-phone').value = entry.phone || '';
          document.getElementById('addr-country').value = entry.country || '';
          document.getElementById('addr-line1').value = entry.line1 || '';
          document.getElementById('addr-line2').value = entry.line2 || '';
          document.getElementById('addr-city').value = entry.city || '';
          document.getElementById('addr-state').value = entry.state || '';
          document.getElementById('addr-zip').value = entry.zip || '';
        }
        
        document.getElementById('entry-notes').value = entry.notes || '';
      }
    } else {
      currentEntryType = type || currentType === 'all' ? 'password' : currentType;
      if (currentEntryType === 'all') currentEntryType = 'password';
      
      titleEl.textContent = '添加' + (TYPES.find(t => t.id === currentEntryType)?.name || '条目');
      deleteBtn.style.display = 'none';
    }
    
    updateTypeSelector();
    showTypeFields(currentEntryType);
    
    modal.classList.add('show');
    setTimeout(() => document.getElementById('entry-title').focus(), 100);
  }

  function updateTypeSelector() {
    document.querySelectorAll('#type-selector .type-option').forEach(el => {
      el.classList.toggle('active', el.dataset.type === currentEntryType);
    });
  }

  function showTypeFields(type) {
    document.getElementById('password-fields').style.display = type === 'password' ? 'block' : 'none';
    document.getElementById('bank-fields').style.display = type === 'bank' ? 'block' : 'none';
    document.getElementById('bill-fields').style.display = type === 'bill' ? 'block' : 'none';
  }

  function closeEntryModal() {
    document.getElementById('entry-modal').classList.remove('show');
  }

  async function saveEntry() {
    const id = document.getElementById('entry-id').value;
    const title = document.getElementById('entry-title').value.trim();
    const notes = document.getElementById('entry-notes').value.trim();
    
    if (!title) {
      showToast('请输入标题', 'error');
      return;
    }
    
    const now = Date.now();
    let entryData = {
      type: currentEntryType,
      title,
      notes,
      updatedAt: now
    };
    
    if (currentEntryType === 'password') {
      entryData.username = document.getElementById('entry-username').value.trim();
      entryData.password = document.getElementById('entry-password').value;
      entryData.url = document.getElementById('entry-url').value.trim();
    } else if (currentEntryType === 'bank') {
      entryData.holder = document.getElementById('bank-holder').value.trim();
      entryData.cardNumber = document.getElementById('bank-number').value.trim();
      entryData.bankName = document.getElementById('bank-name').value.trim();
      entryData.pin = document.getElementById('bank-pin').value;
      entryData.cvv = document.getElementById('bank-cvv').value;
      entryData.expiry = document.getElementById('bank-expiry').value.trim();
      entryData.branch = document.getElementById('bank-branch').value.trim();
    } else if (currentEntryType === 'bill') {
      entryData.lastName = document.getElementById('addr-lastname').value.trim();
      entryData.firstName = document.getElementById('addr-firstname').value.trim();
      entryData.gender = document.getElementById('addr-gender').value;
      entryData.age = document.getElementById('addr-age').value;
      entryData.phone = document.getElementById('addr-phone').value.trim();
      entryData.country = document.getElementById('addr-country').value.trim();
      entryData.line1 = document.getElementById('addr-line1').value.trim();
      entryData.line2 = document.getElementById('addr-line2').value.trim();
      entryData.city = document.getElementById('addr-city').value.trim();
      entryData.state = document.getElementById('addr-state').value.trim();
      entryData.zip = document.getElementById('addr-zip').value.trim();
    }
    
    if (id) {
      const entry = vaultData.entries.find(e => e.id === id);
      if (entry) {
        Object.assign(entry, entryData);
      }
    } else {
      entryData.id = CryptoUtil.generateId();
      entryData.createdAt = now;
      vaultData.entries.push(entryData);
    }
    
    await saveVault();
    renderCategories();
    renderEntries();
    closeEntryModal();
    showToast(id ? '已更新' : '已添加', 'success');
  }

  async function deleteEntry() {
    const id = document.getElementById('entry-id').value;
    if (!id) return;
    
    if (!confirm('确定要删除这条记录吗？')) return;
    
    vaultData.entries = vaultData.entries.filter(e => e.id !== id);
    await saveVault();
    renderCategories();
    renderEntries();
    closeEntryModal();
    showToast('已删除', 'success');
  }

  function generatePassword() {
    const length = parseInt(document.getElementById('password-length').value);
    const options = {
      uppercase: document.getElementById('opt-uppercase').checked,
      lowercase: document.getElementById('opt-lowercase').checked,
      numbers: document.getElementById('opt-numbers').checked,
      symbols: document.getElementById('opt-symbols').checked
    };
    
    const pwd = CryptoUtil.generatePassword(length, options);
    document.getElementById('entry-password').value = pwd;
  }

  function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
      input.type = 'text';
    } else {
      input.type = 'password';
    }
  }

  function copyToClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }

  function showToast(message, type = 'default') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show ' + type;
    setTimeout(() => {
      toast.className = 'toast';
    }, 2000);
  }

  function showError(el, message) {
    el.textContent = message;
    el.style.display = 'block';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function openSettings() {
    document.getElementById('settings-modal').classList.add('show');
  }

  function closeSettings() {
    document.getElementById('settings-modal').classList.remove('show');
  }

  function exportBackup() {
    const result = Storage.exportBackup();
    if (result) {
      showToast('备份已导出', 'success');
    } else {
      showToast('导出失败', 'error');
    }
    closeSettings();
  }

  function importBackup() {
    document.getElementById('import-file').click();
  }

  async function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const data = await Storage.importBackup(file);
      
      if (Storage.hasVault() && !confirm('导入将覆盖当前所有数据，确定继续吗？')) {
        e.target.value = '';
        return;
      }
      
      Storage.saveEncryptedData(data);
      showToast('导入成功，请重新登录', 'success');
      setTimeout(() => {
        location.reload();
      }, 1000);
    } catch (err) {
      showToast(err.message || '导入失败', 'error');
    }
    
    e.target.value = '';
    closeSettings();
  }

  function openChangePassword() {
    closeSettings();
    document.getElementById('old-master-password').value = '';
    document.getElementById('new-master-password').value = '';
    document.getElementById('new-confirm-password').value = '';
    document.getElementById('changepw-error').style.display = 'none';
    document.getElementById('changepw-modal').classList.add('show');
  }

  function closeChangePassword() {
    document.getElementById('changepw-modal').classList.remove('show');
  }

  async function handleChangePassword() {
    const oldPw = document.getElementById('old-master-password').value;
    const newPw = document.getElementById('new-master-password').value;
    const confirmPw = document.getElementById('new-confirm-password').value;
    const errorEl = document.getElementById('changepw-error');
    
    if (!oldPw || !newPw || !confirmPw) {
      showError(errorEl, '请填写所有字段');
      return;
    }
    
    if (newPw !== confirmPw) {
      showError(errorEl, '两次新密码不一致');
      return;
    }
    
    if (newPw.length < 6) {
      showError(errorEl, '新密码至少6位');
      return;
    }
    
    try {
      const encrypted = Storage.loadEncryptedData();
      const oldKey = await CryptoUtil.deriveKey(oldPw, encrypted.salt, encrypted.iterations);
      await CryptoUtil.decryptData(encrypted.data, encrypted.iv, oldKey);
      
      const newSalt = CryptoUtil.generateSalt();
      const newKey = await CryptoUtil.deriveKey(newPw, newSalt);
      
      const jsonStr = JSON.stringify(vaultData);
      const newEncrypted = await CryptoUtil.encryptData(jsonStr, newKey);
      
      const newVault = {
        v: 1,
        salt: newSalt,
        iterations: CryptoUtil.ITERATIONS,
        iv: newEncrypted.iv,
        data: newEncrypted.data
      };
      
      Storage.saveEncryptedData(newVault);
      masterKey = newKey;
      
      closeChangePassword();
      showToast('密码修改成功', 'success');
    } catch (e) {
      showError(errorEl, '当前密码错误');
    }
  }

  async function clearAllData() {
    if (!confirm('确定要清空所有数据吗？此操作不可恢复！')) return;
    if (!confirm('再次确认：所有数据将被永久删除，确定继续？')) return;
    
    Storage.clearVault();
    location.reload();
  }

  function bindEvents() {
    document.getElementById('login-btn').addEventListener('click', handleLogin);

    const loginImportBtn = document.getElementById('login-import-btn');
    if (loginImportBtn) loginImportBtn.addEventListener('click', importBackup);
    
    document.getElementById('master-password').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLogin();
    });
    
    document.getElementById('confirm-password').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLogin();
    });
    
    document.getElementById('lock-btn').addEventListener('click', lockVault);
    
    document.getElementById('add-btn').addEventListener('click', () => {
      let defaultType = 'password';
      if (currentType !== 'all') {
        defaultType = currentType;
      }
      openEntryModal(null, defaultType);
    });
    
    document.getElementById('settings-btn').addEventListener('click', openSettings);
    
    document.getElementById('search-input').addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderEntries();
    });
    
    document.getElementById('entry-modal-close').addEventListener('click', closeEntryModal);
    document.getElementById('entry-cancel-btn').addEventListener('click', closeEntryModal);
    document.getElementById('entry-save-btn').addEventListener('click', saveEntry);
    document.getElementById('delete-entry-btn').addEventListener('click', deleteEntry);
    
    document.querySelector('#entry-modal .modal-overlay').addEventListener('click', closeEntryModal);
    
    document.querySelectorAll('#type-selector .type-option').forEach(el => {
      el.addEventListener('click', () => {
        currentEntryType = el.dataset.type;
        updateTypeSelector();
        showTypeFields(currentEntryType);
        const typeInfo = TYPES.find(t => t.id === currentEntryType);
        document.getElementById('entry-modal-title').textContent = 
          (document.getElementById('entry-id').value ? '编辑' : '添加') + (typeInfo?.name || '条目');
      });
    });
    
    document.getElementById('toggle-password').addEventListener('click', () => {
      togglePasswordVisibility('entry-password');
    });
    
    document.querySelectorAll('.password-toggle[data-target]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);
        if (input.type === 'password') {
          input.type = 'text';
          btn.textContent = '🙈';
        } else {
          input.type = 'password';
          btn.textContent = '👁️';
        }
      });
    });
    
    document.getElementById('generate-password-btn').addEventListener('click', () => {
      const options = document.getElementById('password-options');
      options.style.display = options.style.display === 'none' ? 'block' : 'none';
      generatePassword();
    });
    
    document.getElementById('password-length').addEventListener('input', (e) => {
      document.getElementById('password-length-val').textContent = e.target.value;
      generatePassword();
    });
    
    ['opt-uppercase', 'opt-lowercase', 'opt-numbers', 'opt-symbols'].forEach(id => {
      document.getElementById(id).addEventListener('change', generatePassword);
    });
    
    document.getElementById('settings-modal-close').addEventListener('click', closeSettings);
    document.querySelector('#settings-modal .modal-overlay').addEventListener('click', closeSettings);
    
    document.getElementById('export-btn').addEventListener('click', exportBackup);
    document.getElementById('import-btn').addEventListener('click', importBackup);
    document.getElementById('import-file').addEventListener('change', handleImportFile);
    document.getElementById('change-password-btn').addEventListener('click', openChangePassword);
    document.getElementById('clear-data-btn').addEventListener('click', clearAllData);
    
    document.getElementById('changepw-modal-close').addEventListener('click', closeChangePassword);
    document.getElementById('changepw-cancel-btn').addEventListener('click', closeChangePassword);
    document.getElementById('changepw-save-btn').addEventListener('click', handleChangePassword);
    document.querySelector('#changepw-modal .modal-overlay').addEventListener('click', closeChangePassword);
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (document.getElementById('entry-modal').classList.contains('show')) closeEntryModal();
        else if (document.getElementById('changepw-modal').classList.contains('show')) closeChangePassword();
        else if (document.getElementById('settings-modal').classList.contains('show')) closeSettings();
      }
    });
  }

  return {
    init
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
