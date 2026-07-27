<script setup>
import { onMounted, computed, ref, onBeforeUnmount } from 'vue'
import { useMail } from './composables/useMail'
import AccountDialog from './components/AccountDialog.vue'
import ComposeDialog from './components/ComposeDialog.vue'
import ContactsDialog from './components/ContactsDialog.vue'
import SignaturesDialog from './components/SignaturesDialog.vue'
import SettingsDialog from './components/SettingsDialog.vue'

const {
  state,
  currentAccount,
  displayFolders,
  messageGroups,
  formatDate,
  stripHtml,
  bootstrap,
  goMail,
  openScreen,
  setListFilter,
  selectAccount,
  selectFolder,
  selectMessage,
  setMessageSeen,
  markAllInboxRead,
  sync,
  openCompose,
  sendMail,
  saveAccount,
  deleteAccount,
  openAccountDialog,
  saveContact,
  deleteContact,
  saveSignature,
  deleteSignature,
  saveSettings,
  handleMailNew,
  clearError,
  LOCAL_SENT,
} = useMail()

const menuOpen = ref(false)
const menuRoot = ref(null)
const ctxMenu = ref(null)
const appVersion = ref('')
const updateInfo = ref(null)
let offMailNew = null
let offUpdateAvailable = null
let offUpdateProgress = null
let offUpdateDownloaded = null

function onGlobalContextMenu(e) {
  if (ctxMenu.value && !e.target.closest?.('.ctx-menu')) closeCtxMenu()
}

const folderLabel = (f) => {
  if (f.path === LOCAL_SENT || f.specialUse === '\\Sent' || /sent|inviate/i.test(f.path)) return 'Inviate'
  if (f.specialUse === '\\Inbox' || f.path.toUpperCase() === 'INBOX') return 'Posta in arrivo'
  if (f.specialUse === '\\Drafts') return 'Bozze'
  if (f.specialUse === '\\Trash') return 'Cestino'
  if (f.specialUse === '\\Junk') return 'Spam'
  return f.name || f.path
}

const isSentFolder = computed(() => {
  const f = state.folder
  return f === LOCAL_SENT || /sent|inviate/i.test(f)
})

const bodyHtml = computed(() => state.selected?.html || '')
const bodyText = computed(() => state.selected?.text || '')

const previewText = (m) => m.text || stripHtml(m.html || '')

function toggleMenu() {
  menuOpen.value = !menuOpen.value
}

function closeMenu() {
  menuOpen.value = false
}

function runMenu(action) {
  closeMenu()
  action()
}

function onDocClick(e) {
  if (menuOpen.value && menuRoot.value && !menuRoot.value.contains(e.target)) {
    closeMenu()
  }
  if (ctxMenu.value) closeCtxMenu()
}

function openCtxMenu(e, message) {
  e.preventDefault()
  e.stopPropagation()
  closeMenu()
  ctxMenu.value = {
    uid: message.uid,
    seen: Boolean(message.seen),
    x: e.clientX,
    y: e.clientY,
  }
}

function closeCtxMenu() {
  ctxMenu.value = null
}

async function ctxSetSeen(seen) {
  const uid = ctxMenu.value?.uid
  closeCtxMenu()
  if (uid == null) return
  await setMessageSeen(seen, uid)
}

async function installUpdateNow() {
  await window.webison.installUpdate()
}

function dismissUpdate() {
  if (updateInfo.value) updateInfo.value = { ...updateInfo.value, dismissed: true }
}

onMounted(async () => {
  bootstrap()
  document.addEventListener('click', onDocClick)
  document.addEventListener('contextmenu', onGlobalContextMenu)
  try {
    appVersion.value = await window.webison.getAppVersion()
  } catch {
    appVersion.value = ''
  }
  if (window.webison?.onMailNew) {
    offMailNew = window.webison.onMailNew((payload) => {
      handleMailNew(payload)
    })
  }
  if (window.webison?.onUpdateAvailable) {
    offUpdateAvailable = window.webison.onUpdateAvailable((payload) => {
      updateInfo.value = {
        status: 'available',
        version: payload.version,
        percent: 0,
        dismissed: false,
      }
    })
  }
  if (window.webison?.onUpdateProgress) {
    offUpdateProgress = window.webison.onUpdateProgress((payload) => {
      updateInfo.value = {
        status: 'downloading',
        version: updateInfo.value?.version || '',
        percent: Math.round(payload.percent || 0),
        dismissed: false,
      }
    })
  }
  if (window.webison?.onUpdateDownloaded) {
    offUpdateDownloaded = window.webison.onUpdateDownloaded((payload) => {
      updateInfo.value = {
        status: 'ready',
        version: payload.version,
        percent: 100,
        dismissed: false,
      }
    })
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('contextmenu', onGlobalContextMenu)
  if (typeof offMailNew === 'function') offMailNew()
  if (typeof offUpdateAvailable === 'function') offUpdateAvailable()
  if (typeof offUpdateProgress === 'function') offUpdateProgress()
  if (typeof offUpdateDownloaded === 'function') offUpdateDownloaded()
})
</script>

<template>
  <div class="app">
    <header class="titlebar">
      <div class="titlebar-brand">Webison Mailer</div>
      <div class="titlebar-actions">
        <button class="btn btn-ghost" :disabled="!state.accountId || state.syncing" @click="sync">
          {{ state.syncing ? 'Sincronizzo…' : 'Aggiorna' }}
        </button>

        <div ref="menuRoot" class="menu-wrap">
          <button
            class="btn btn-ghost menu-toggle"
            :aria-expanded="menuOpen"
            aria-label="Menu"
            @click.stop="toggleMenu"
          >
            <span class="burger" aria-hidden="true">
              <span /><span /><span />
            </span>
          </button>
          <div v-if="menuOpen" class="menu-panel" role="menu">
            <button
              class="menu-item"
              role="menuitem"
              :disabled="!state.accountId"
              @click="runMenu(() => openCompose(false))"
            >
              Nuovo messaggio
            </button>
            <button class="menu-item" role="menuitem" @click="runMenu(() => openAccountDialog(null))">
              Aggiungi account
            </button>
            <button
              class="menu-item"
              role="menuitem"
              :disabled="!state.accountId"
              @click="runMenu(() => openAccountDialog(currentAccount))"
            >
              Modifica account
            </button>
            <div class="menu-sep" />
            <button class="menu-item" role="menuitem" @click="runMenu(() => openScreen('contacts'))">
              Rubrica
            </button>
            <button class="menu-item" role="menuitem" @click="runMenu(() => openScreen('signatures'))">
              Firme
            </button>
            <button class="menu-item" role="menuitem" @click="runMenu(() => openScreen('settings'))">
              Impostazioni
            </button>
          </div>
        </div>
      </div>
    </header>

    <ComposeDialog
      v-if="state.screen === 'compose'"
      :model="state.compose"
      :contacts="state.contacts"
      :loading="state.loading"
      :error="state.error"
      @back="goMail"
      @send="sendMail"
    />

    <AccountDialog
      v-else-if="state.screen === 'account'"
      :account="state.editingAccount"
      :signatures="state.signatures"
      @back="goMail"
      @save="saveAccount"
      @delete="deleteAccount"
    />

    <ContactsDialog
      v-else-if="state.screen === 'contacts'"
      :contacts="state.contacts"
      @back="goMail"
      @save="saveContact"
      @delete="deleteContact"
    />

    <SignaturesDialog
      v-else-if="state.screen === 'signatures'"
      :signatures="state.signatures"
      :accounts="state.accounts"
      @back="goMail"
      @save="saveSignature"
      @delete="deleteSignature"
    />

    <SettingsDialog
      v-else-if="state.screen === 'settings'"
      :settings="state.settings"
      :app-version="appVersion"
      @back="goMail"
      @save="saveSettings"
      @markAllInboxRead="markAllInboxRead"
    />

    <div v-else class="layout">
      <aside class="panel sidebar">
        <div class="sidebar-top">
          <button class="btn btn-primary btn-block" @click="openCompose(false)" :disabled="!state.accountId">
            Scrivi
          </button>
        </div>

        <div class="sidebar-scroll">
          <div class="sidebar-section">
            <div class="sidebar-label">Account</div>
            <div
              v-for="a in state.accounts"
              :key="a.id"
              class="account-row"
              :class="{ active: a.id === state.accountId }"
            >
              <button
                class="account-item"
                @click="selectAccount(a.id)"
                @dblclick="openAccountDialog(a)"
              >
                <span>{{ a.name }}</span>
                <small>{{ a.email }}</small>
              </button>
              <button
                type="button"
                class="btn btn-ghost btn-sm account-edit"
                title="Modifica account"
                @click.stop="openAccountDialog(a)"
              >
                Modifica
              </button>
            </div>
            <p v-if="!state.accounts.length" class="empty">Nessun account</p>
            <button class="btn btn-ghost btn-block btn-sm" @click="openAccountDialog(null)">
              + Account
            </button>
          </div>

          <div class="sidebar-section" v-if="state.accountId">
            <div class="sidebar-label">Cartelle</div>
            <button
              v-for="f in displayFolders"
              :key="f.path"
              class="nav-item"
              :class="{ active: f.path === state.folder }"
              @click="selectFolder(f.path)"
            >
              {{ folderLabel(f) }}
            </button>
          </div>
        </div>
      </aside>

      <section class="panel">
        <div class="toolbar">
          <h2>{{ currentAccount?.email || 'Posta' }}</h2>
          <span class="spacer" />
          <div class="seg filter-seg">
            <button
              type="button"
              class="btn btn-ghost"
              :class="{ active: state.listFilter === 'unread' }"
              @click="setListFilter('unread')"
            >
              Non lette
            </button>
            <button
              type="button"
              class="btn btn-ghost"
              :class="{ active: state.listFilter === 'read' }"
              @click="setListFilter('read')"
            >
              Lette
            </button>
            <button
              type="button"
              class="btn btn-ghost"
              :class="{ active: state.listFilter === 'all' }"
              @click="setListFilter('all')"
            >
              Tutte
            </button>
          </div>
          <span class="status">
            {{ state.syncing ? 'Sync…' : `${state.messages.length}` }}
          </span>
        </div>

        <div class="message-list" @click="closeCtxMenu">
          <template v-for="group in messageGroups" :key="group.key">
            <div class="list-group-label">{{ group.label }}</div>
            <button
              v-for="m in group.items"
              :key="m.uid"
              class="message-row"
              :class="{ active: m.uid === state.selectedUid, unread: !m.seen }"
              @click="selectMessage(m.uid)"
              @contextmenu="openCtxMenu($event, m)"
            >
              <div class="top">
                <div class="from">
                  {{ isSentFolder ? (m.to || '(destinatario)') : (m.from || '(mittente)') }}
                </div>
                <span class="date">{{ formatDate(m.date) }}</span>
              </div>
              <div class="subject">{{ m.subject }}</div>
              <div class="preview">{{ previewText(m) }}</div>
            </button>
          </template>
          <p v-if="!messageGroups.length" class="empty">
            {{
              !state.accountId
                ? 'Aggiungi un account per iniziare.'
                : state.listFilter === 'unread'
                  ? 'Nessuna email non letta.'
                  : state.listFilter === 'read'
                    ? 'Nessuna email letta.'
                    : isSentFolder
                      ? 'Nessuna email inviata.'
                      : 'Nessun messaggio. Premi Aggiorna.'
            }}
          </p>
        </div>
      </section>

      <section class="panel reader">
        <template v-if="state.selected">
          <div class="reader-header">
            <div class="reader-title-row">
              <h1>{{ state.selected.subject }}</h1>
              <div class="row-actions">
                <button
                  class="btn btn-ghost"
                  @click="setMessageSeen(!state.selected.seen)"
                >
                  {{ state.selected.seen ? 'Non letta' : 'Letta' }}
                </button>
                <button class="btn btn-ghost" @click="openCompose(true)">Rispondi</button>
                <button class="btn btn-primary" @click="openCompose(true, true)">Rispondi a tutti</button>
              </div>
            </div>
            <div class="reader-meta">
              <div><strong>Da</strong> {{ state.selected.from }}</div>
              <div><strong>A</strong> {{ state.selected.to }}</div>
              <div v-if="state.selected.cc"><strong>Cc</strong> {{ state.selected.cc }}</div>
              <div><strong>Data</strong> {{ new Date(state.selected.date).toLocaleString('it-IT') }}</div>
            </div>
          </div>
          <div class="reader-body">
            <iframe
              v-if="bodyHtml"
              class="mail-frame"
              sandbox=""
              :srcdoc="bodyHtml"
              title="Contenuto messaggio"
            />
            <pre v-else>{{ bodyText || '(nessun contenuto)' }}</pre>
          </div>
        </template>
        <div v-else class="reader-empty">Seleziona un messaggio</div>
      </section>
    </div>

    <div
      v-if="ctxMenu"
      class="ctx-menu"
      :style="{ left: `${ctxMenu.x}px`, top: `${ctxMenu.y}px` }"
      @click.stop
    >
      <button
        v-if="!ctxMenu.seen"
        class="menu-item"
        @click="ctxSetSeen(true)"
      >
        Segna come letta
      </button>
      <button
        v-else
        class="menu-item"
        @click="ctxSetSeen(false)"
      >
        Segna come non letta
      </button>
    </div>

    <div v-if="state.error" class="overlay" @click.self="clearError">
      <div class="dialog error-dialog" role="alertdialog" aria-labelledby="error-title">
        <div class="dialog-header">
          <h3 id="error-title">Errore</h3>
          <button class="btn btn-ghost btn-sm" @click="clearError">Chiudi</button>
        </div>
        <div class="dialog-body">
          <p class="error-text">{{ state.error }}</p>
        </div>
        <div class="dialog-footer">
          <button class="btn btn-primary" @click="clearError">OK</button>
        </div>
      </div>
    </div>

    <div
      v-if="updateInfo && !updateInfo.dismissed"
      class="update-toast"
      role="status"
    >
      <div class="update-toast-body">
        <strong v-if="updateInfo.status === 'ready'">
          Aggiornamento {{ updateInfo.version }} pronto
        </strong>
        <strong v-else-if="updateInfo.status === 'downloading'">
          Scarico aggiornamento… {{ updateInfo.percent }}%
        </strong>
        <strong v-else>
          Nuovo aggiornamento {{ updateInfo.version }}
        </strong>
        <span v-if="updateInfo.status === 'ready'">Riavvia per installarlo.</span>
        <span v-else-if="updateInfo.status === 'available'">Download in corso…</span>
      </div>
      <div class="update-toast-actions">
        <button
          v-if="updateInfo.status === 'ready'"
          class="btn btn-primary btn-sm"
          @click="installUpdateNow"
        >
          Riavvia ora
        </button>
        <button class="btn btn-ghost btn-sm" @click="dismissUpdate">Più tardi</button>
      </div>
    </div>
  </div>
</template>
