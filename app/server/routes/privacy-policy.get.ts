import { defineEventHandler } from "nitro/h3";

const policy = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pokeworld API Privacy Policy</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; color: #181818; background: #b2f594; }
      main { max-width: 600px; margin: 0 auto; padding: 100px 24px; }
      h1 { font-size: 48px; margin: 0 0 12px; }
      p { line-height: 1.6; }
      a { color: #277a37; }
    </style>
  </head>
  <body>
    <main>
      <h1>Privacy Policy</h1>
      <p>The friendly Pokeworld API Privacy Policy</p>
      <p>This API uses YouTube API Services.</p>
      <p>Pokeworld API does not use analytics tools to store data, nor does it store user data of any kind.</p>
      <p>We do not allow third parties to serve ads on Pokeworld API.</p>
      <p>Contact <a href="mailto:pokeworldAPI@alopu.com">pokeworldAPI@alopu.com</a>.</p>
      <p><a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a></p>
      <p><a href="https://policies.google.com/privacy">Google Privacy Policy</a></p>
    </main>
  </body>
</html>`;

export default defineEventHandler(() =>
  new Response(policy, { headers: { "content-type": "text/html; charset=utf-8" } }),
);
