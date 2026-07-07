/*
 ** TailwindCSS Configuration File
 **
 ** Docs: https://tailwindcss.com/docs/configuration
 ** Default: https://github.com/tailwindcss/tailwindcss/blob/master/stubs/defaultConfig.stub.js
 */
const tailwindConf = {
  theme: {
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1440px'
    },
    fontFamily: {
    },
    extend: {
      maxWidth: {
        '1/12': '8.33333%',
        '2/12': '16.66667%',
        '3/12': '25%',
        '4/12': '33.33333%',
        '5/12': '41.66667%',
        '6/12': '50%',
        '7/12': '58.33333%',
        '8/12': '66.66667%',
        '9/12': '75%',
        '10/12': '83.33333%',
        '11/12': '91.66667%'
      },
      screens: {
        short: { raw: '(min-height: 550px)' },
        tall: { raw: '(min-height: 1000px)' }
      },
      spacing: {
        '1/2': '50%',
        '1/3': '33.33333%',
        '2/3': '66.66667%',
        '1/4': '25%',
        '2/4': '50%',
        '3/4': '75%',
        '1/5': '20%',
        '2/5': '40%',
        '3/5': '60%',
        '4/5': '80%',
        '1/6': '16.66667%',
        '2/6': '33.33333%',
        '3/6': '50%',
        '4/6': '66.66667%',
        '5/6': '83.33333%',
        '1/12': '8.33333%',
        '2/12': '16.66667%',
        '3/12': '25%',
        '4/12': '33.33333%',
        '5/12': '41.66667%',
        '6/12': '50%',
        '7/12': '58.33333%',
        '8/12': '66.66667%',
        '9/12': '75%',
        '10/12': '83.33333%',
        '11/12': '91.66667%',
        '11/10': '110%',
        '6/5': '120%',
        '7/5': '140%',
        100: '100%'
      },
      fontSize: {
        '2xs': '11px',
        xs: '13px',
        sm: '15px',
        base: '16px',
        lg: '18px',
        xl: '20px',
        '2xl': '23px',
        '3xl': '31px',
        '4xl': '40px',
        '5xl': '46px',
        '6xl': '68px',
        '7xl': '93px'
      },
      fontWeight: {
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700
      }
    },
    colors: {
      red: '#FF0000',
      green: '#B2F594',
      // grass: '#25C189',
      grass: '#70C0A0',
      grass2: '#2AA26D',
      grass3: '#277A37',
      black: '#181818',
      white: '#ffffff',
      gameboy: {
        grey: '#EBE6E2'
      },
      blue: '#3F81E6',
      teal: '#D4F2EF',
      transparent: 'rgba(255,255,255,0)'
    }
  },
  variants: {},
  plugins: []
}

for (let i = 0; i <= 10; i++) {
  const ii = '0' + i
  tailwindConf.theme.extend.spacing[ii] = (i / 10) * 0.25 + 'rem'
  tailwindConf.theme.extend.spacing[ii + 'vh'] = i / 10 + 'vh'
  tailwindConf.theme.extend.spacing[ii + 'vw'] = i / 10 + 'vw'
  tailwindConf.theme.extend.spacing[ii + 'p'] = i / 10 + '%'
  tailwindConf.theme.extend.spacing[i + 'px'] = i + 'px'
}
for (let i = 0; i <= 100; i++) {
  tailwindConf.theme.extend.spacing[i] = i * 0.25 + 'rem'
  tailwindConf.theme.extend.spacing[i + 'vh'] = i + 'vh'
  tailwindConf.theme.extend.spacing[i + 'vw'] = i + 'vw'
  tailwindConf.theme.extend.spacing[i + 'p'] = i + '%'
}
for (let i = 0; i <= 2200; i++) {
  if (i % 10 === 0) {
    tailwindConf.theme.extend.spacing[i + 'px'] = i + 'px'
  }
}

module.exports = tailwindConf
