// ~/plugins/persistedState.client.js
import createPersistedState from 'vuex-persistedstate'

export default ({ store }) => {
  createPersistedState({
    key: 'things',
    paths: ['things']
  })(store)
  if (typeof window !== 'undefined') {
    window.$store = store
  }
}
