const globalStyles = String.raw`
/*! tailwindcss v4.3.3 | MIT License | https://tailwindcss.com */
@layer properties{@supports (((-webkit-hyphens:none)) and (not (margin-trim:inline))) or ((-moz-orient:inline) and (not (color:rgb(from red r g b)))){*,:before,:after,::backdrop{--tw-blur:initial;--tw-brightness:initial;--tw-contrast:initial;--tw-grayscale:initial;--tw-hue-rotate:initial;--tw-invert:initial;--tw-opacity:initial;--tw-saturate:initial;--tw-sepia:initial;--tw-drop-shadow:initial;--tw-drop-shadow-color:initial;--tw-drop-shadow-alpha:100%;--tw-drop-shadow-size:initial}}}@layer theme{:root,:host{--font-sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","Noto Sans",Arial,sans-serif;--default-font-family:var(--font-sans)}}@layer base{*,:after,:before,::backdrop{box-sizing:border-box;border:0 solid;margin:0;padding:0}html,:host{-webkit-text-size-adjust:100%;tab-size:4;line-height:1.5;font-family:var(--default-font-family)}a{color:inherit;text-decoration:inherit}button,input,select,textarea{font:inherit;color:inherit;background-color:#0000;border-radius:0}textarea{resize:vertical}button,input:where([type=button],[type=reset],[type=submit]){appearance:button}[hidden]:where(:not([hidden=until-found])){display:none!important}}

:root { font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#1c2522; background:#f5f7f6; font-synthesis:none; text-rendering:optimizeLegibility; -webkit-font-smoothing:antialiased; --ink:#1c2522; --muted:#7c8984; --line:#e7ece9; --green:#147d62; --green-dark:#0d604b; --green-soft:#e9f5f0; --surface:#fff; --shadow:0 12px 40px rgb(23 52 42 / 5%); }
* { box-sizing:border-box; }
body { min-width:320px; margin:0; }
button, a { -webkit-tap-highlight-color:transparent; }
button { cursor:pointer; }
a { color:inherit; text-decoration:none; }
button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline:3px solid rgb(20 125 98 / 24%); outline-offset:2px; }
`

export const GlobalStyles = () => <style>{globalStyles}</style>
