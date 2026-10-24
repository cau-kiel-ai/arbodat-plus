<script lang="ts">
  let {
    closing,
    right,
    disabled = false,
    onclick,
  }: {
    /** Shows the close "x" (the Control Center is open and can be closed); otherwise the cog. */
    closing: boolean;
    /** Distance from the right edge in px; the same as the cog in the ArboDat+ page (shims.js). */
    right: number;
    disabled?: boolean;
    onclick: () => void;
  } = $props();
</script>

<!-- The same spot and size as the cog in the ArboDat+ page (windows/scripts/shims.js), so the
     cog seems to turn into the "x" when the Control Center slides in, and back when it leaves. -->
<button
  class="cog"
  class:closing
  type="button"
  style:right="{right}px"
  {disabled}
  {onclick}
  title={closing ? "Close the Control Center" : "Control Center"}
  aria-label={closing ? "Close the Control Center" : "Control Center"}
>
  <svg class="gear" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
    <path d="M9.71 4.75 L10.14 1.97 L13.86 1.97 L14.29 4.75 L15.51 5.26 L17.78 3.59 L20.41 6.22 L18.74 8.49 L19.25 9.71 L22.03 10.14 L22.03 13.86 L19.25 14.29 L18.74 15.51 L20.41 17.78 L17.78 20.41 L15.51 18.74 L14.29 19.25 L13.86 22.03 L10.14 22.03 L9.71 19.25 L8.49 18.74 L6.22 20.41 L3.59 17.78 L5.26 15.51 L4.75 14.29 L1.97 13.86 L1.97 10.14 L4.75 9.71 L5.26 8.49 L3.59 6.22 L6.22 3.59 L8.49 5.26 Z" />
    <circle cx="12" cy="12" r="3.3" />
  </svg>
  <svg class="x" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
</button>

<style>
  .cog {
    position: fixed; /* relative to the card (it is transformed), which spans the window's right edge */
    top: 10px;
    z-index: 2;
    width: 38px;
    height: 38px;
    padding: 0;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: var(--text);
    flex: none;
  }
  svg { grid-area: 1 / 1; transition: transform 0.35s ease, opacity 0.25s ease; }
  .gear { opacity: 1; transform: rotate(0deg); }
  .x { opacity: 0; transform: rotate(-90deg); }
  .closing .gear { opacity: 0; transform: rotate(90deg); }
  .closing .x { opacity: 1; transform: rotate(0deg); }
  .cog:disabled { opacity: 0.4; }
  @media (prefers-reduced-motion: reduce) {
    svg { transition: none; }
  }
</style>
