const Storage = (() => {
  const STORAGE_KEY = 'password_vault';

  function hasVault() {
    return localStorage.getItem(STORAGE_KEY) !== null;
  }

  function saveEncryptedData(vaultData) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(vaultData));
  }

  function loadEncryptedData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function clearVault() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function exportBackup() {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `password-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  }

  function b64Decode(str) {
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function importBackup(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          // 结构化校验，避免用损坏文件覆盖现有数据
          if (
            !data || typeof data !== 'object' ||
            data.v !== 1 ||
            typeof data.salt !== 'string' || !data.salt ||
            typeof data.iv !== 'string' || !data.iv ||
            typeof data.data !== 'string' || !data.data ||
            (data.iterations !== undefined && typeof data.iterations !== 'number')
          ) {
            reject(new Error('无效的备份文件格式'));
            return;
          }
          // 尝试 base64 解码，确认密文/IV 基本可用（AES-GCM IV 应为 12 字节）
          try {
            const ivBytes = b64Decode(data.iv);
            const dataBytes = b64Decode(data.data);
            if (ivBytes.length !== 12 || dataBytes.length === 0) {
              reject(new Error('备份文件密文格式异常'));
              return;
            }
          } catch (err) {
            reject(new Error('备份文件密文无法解析'));
            return;
          }
          resolve(data);
        } catch (err) {
          reject(new Error('文件解析失败'));
        }
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsText(file);
    });
  }

  return {
    hasVault,
    saveEncryptedData,
    loadEncryptedData,
    clearVault,
    exportBackup,
    importBackup,
    STORAGE_KEY
  };
})();
