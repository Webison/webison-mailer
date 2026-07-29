const fs = require('fs')
const path = require('path')

const STORE_DIR = 'webison-data'
const DEFAULT_SETTINGS = {
  theme: 'light',
  colorPreset: 'blu',
  notificationsEnabled: true,
  pollIntervalSec: 60,
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function hasMessages(dir) {
  if (!fs.existsSync(dir)) return false
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (hasMessages(target)) return true
    } else if (entry.name === 'messages.json') {
      const messages = readJson(target, [])
      if (Array.isArray(messages) && messages.length) return true
    }
  }
  return false
}

function hasPrimaryStoreData(userDataPath) {
  const storeRoot = path.join(userDataPath, STORE_DIR)
  if (!fs.existsSync(storeRoot)) return false

  for (const file of ['accounts.json', 'contacts.json', 'signatures.json']) {
    const value = readJson(path.join(storeRoot, file), [])
    if (Array.isArray(value) && value.length) return true
  }

  return hasMessages(path.join(storeRoot, 'mail'))
}

function hasCustomSettings(userDataPath) {
  const storeRoot = path.join(userDataPath, STORE_DIR)
  const settings = readJson(path.join(storeRoot, 'settings.json'), null)
  return Boolean(
    settings &&
    Object.entries(DEFAULT_SETTINGS).some(([key, value]) => settings[key] !== value),
  )
}

function hasMeaningfulStoreData(userDataPath) {
  return hasPrimaryStoreData(userDataPath) || hasCustomSettings(userDataPath)
}

function uniqueSibling(target, suffix) {
  let candidate = `${target}.${suffix}`
  let index = 1
  while (fs.existsSync(candidate)) {
    candidate = `${target}.${suffix}-${index}`
    index += 1
  }
  return candidate
}

function resolveStoreUserDataPath(targetUserDataPath, fallbackUserDataPaths = []) {
  if (hasPrimaryStoreData(targetUserDataPath)) return targetUserDataPath

  const targetStoreRoot = path.join(targetUserDataPath, STORE_DIR)
  const fallbackUserDataPath = fallbackUserDataPaths.find((candidate) => {
    if (!candidate || path.resolve(candidate) === path.resolve(targetUserDataPath)) return false
    return hasMeaningfulStoreData(candidate)
  })
  if (!fallbackUserDataPath) return targetUserDataPath

  const fallbackStoreRoot = path.join(fallbackUserDataPath, STORE_DIR)
  const stagingRoot = uniqueSibling(targetStoreRoot, 'migrating')
  let backupRoot = null

  try {
    fs.mkdirSync(targetUserDataPath, { recursive: true })
    fs.cpSync(fallbackStoreRoot, stagingRoot, { recursive: true, errorOnExist: true })
    const targetSettings = path.join(targetStoreRoot, 'settings.json')
    if (hasCustomSettings(targetUserDataPath) && fs.existsSync(targetSettings)) {
      fs.copyFileSync(targetSettings, path.join(stagingRoot, 'settings.json'))
    }
    if (fs.existsSync(targetStoreRoot)) {
      backupRoot = uniqueSibling(targetStoreRoot, 'pre-1.5.1')
      fs.renameSync(targetStoreRoot, backupRoot)
    }
    fs.renameSync(stagingRoot, targetStoreRoot)
    return targetUserDataPath
  } catch {
    try {
      if (fs.existsSync(stagingRoot)) fs.rmSync(stagingRoot, { recursive: true, force: true })
      if (backupRoot && fs.existsSync(backupRoot) && !fs.existsSync(targetStoreRoot)) {
        fs.renameSync(backupRoot, targetStoreRoot)
      }
    } catch {
      // Il fallback alla cartella storica mantiene comunque accessibili i dati.
    }
    return fallbackUserDataPath
  }
}

module.exports = {
  hasMeaningfulStoreData,
  hasPrimaryStoreData,
  resolveStoreUserDataPath,
}
