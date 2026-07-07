export const state = () => ({
  loggedIn: false,
  player: {},
  map: {},
  game: {}
})

export const getters = {
  // getCounter(state) {
  //   return state.counter
  // }
}

export const mutations = {
  thing(state, args) {
    state[args.key] = args.value
  }
  // increment(state) {
  //   state.counter++
  // }
}

export const actions = {
  // async fetchCounter({ state }) {
  //   // make request
  //   const res = { data: 10 }
  //   state.counter = res.data
  //   return res.data
  // }
}
