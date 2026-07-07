<template>
  <div class="w-full flex items-center justify-center">
    <div class="login-register-form max-w-600px">
      <div class="loading-container">
        <img src="/loading.gif">
      </div>
      <div class="w-full bg-white">
        <input v-model="username" class="w-full px-3 py-2" placeholder="Username / Email" type="email">
      </div>
      <div class="w-full bg-white mt-3">
        <input v-model="password" class="w-full px-3 py-2" placeholder="Password" type="password">
      </div>
      <div class="w-full bg-grass cursor-pointer text-white px-3 py-2 mt-3" @click="login">
        Login
      </div>
      <div v-if="error" class="w-full bg-red text-white px-3 py-2 mt-3">
        {{ error }}
      </div>
    </div>
  </div>
</template>
<script>
export default {
  data () {
    return {
      username: '',
      password: '',
      error: ''
    }
  },
  mounted() {
    if (this.$store.state.things.loggedIn) {
      this.$router.push('/game')
    }
  },
  methods: {
    login () {
      if (this.username === 'lopu' && this.password === 'lopulopu') {
        this.error = ''
        this.$store.commit('things/thing', {
          key: 'loggedIn',
          value: true
        })
        this.$store.commit('things/thing', {
          key: 'username',
          value: this.username
        })
        this.$router.push('/game')
      } else {
        this.error = 'Incorrect username or password'
      }
    }
  }
}
</script>
