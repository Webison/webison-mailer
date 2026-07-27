const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('webison', {
  listAccounts: () => ipcRenderer.invoke('accounts:list'),
  saveAccount: (input) => ipcRenderer.invoke('accounts:save', input),
  deleteAccount: (id) => ipcRenderer.invoke('accounts:delete', id),
  listFolders: (accountId) => ipcRenderer.invoke('mail:folders', accountId),
  syncMail: (accountId, folder, storeAs) => ipcRenderer.invoke('mail:sync', { accountId, folder, storeAs }),
  listMessages: (accountId, folder) => ipcRenderer.invoke('mail:list', { accountId, folder }),
  getMessage: (accountId, folder, uid) => ipcRenderer.invoke('mail:get', { accountId, folder, uid }),
  setMessageSeen: (accountId, folder, uid, seen) =>
    ipcRenderer.invoke('mail:setSeen', { accountId, folder, uid, seen }),
  markAllInboxRead: () => ipcRenderer.invoke('mail:markAllInboxRead'),
  sendMail: (payload) => ipcRenderer.invoke('mail:send', payload),
  listContacts: () => ipcRenderer.invoke('contacts:list'),
  saveContact: (input) => ipcRenderer.invoke('contacts:save', input),
  deleteContact: (id) => ipcRenderer.invoke('contacts:delete', id),
  listSignatures: () => ipcRenderer.invoke('signatures:list'),
  saveSignature: (input) => ipcRenderer.invoke('signatures:save', input),
  deleteSignature: (id) => ipcRenderer.invoke('signatures:delete', id),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  onMailNew: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('mail:new', listener)
    return () => ipcRenderer.removeListener('mail:new', listener)
  },
  onUpdateAvailable: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('update:available', listener)
    return () => ipcRenderer.removeListener('update:available', listener)
  },
  onUpdateProgress: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('update:progress', listener)
    return () => ipcRenderer.removeListener('update:progress', listener)
  },
  onUpdateDownloaded: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('update:downloaded', listener)
    return () => ipcRenderer.removeListener('update:downloaded', listener)
  },
  onUpdateNotAvailable: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('update:not-available', listener)
    return () => ipcRenderer.removeListener('update:not-available', listener)
  },
  onUpdateError: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('update:error', listener)
    return () => ipcRenderer.removeListener('update:error', listener)
  },
})
