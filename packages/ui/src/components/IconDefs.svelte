<script lang="ts">
// Sprite-only component: renders the hidden <symbol> defs once per page.
</script>

<!-- Icon sprite for the approved design — referenced by <Icon name="…"> via <use>. -->
<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">
	<symbol id="i-logo" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" style="fill:currentColor;stroke:none"/><path d="M20 21 L32 32 L20 43" style="stroke:#fff;fill:none;stroke-width:6;stroke-linecap:round;stroke-linejoin:round"/><path d="M35 43 H46" style="stroke:#fff;fill:none;stroke-width:6;stroke-linecap:round"/></symbol>
	<symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.5-4.5"/></symbol>
	<symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></symbol>
	<symbol id="i-close" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></symbol>
	<symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3Z"/></symbol>
	<symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></symbol>
	<symbol id="i-moon" viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/></symbol>
	<symbol id="i-download" viewBox="0 0 24 24"><path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 20h16"/></symbol>
	<symbol id="i-chevron-down" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></symbol>
	<symbol id="i-chevron-end" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></symbol>
	<symbol id="i-arrow-end" viewBox="0 0 24 24"><path d="M4 12h16m0 0-6-6m6 6-6 6"/></symbol>
	<symbol id="i-arrow-start" viewBox="0 0 24 24"><path d="M20 12H4m0 0 6-6m-6 6 6 6"/></symbol>
	<symbol id="i-check" viewBox="0 0 24 24"><path d="m4.5 12.5 5 5 10-11"/></symbol>
	<symbol id="i-copy" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></symbol>
	<symbol id="i-external" viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"/></symbol>
	<symbol id="i-filter" viewBox="0 0 24 24"><path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z"/></symbol>
	<symbol id="i-dice" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="15" r="1" fill="currentColor" stroke="none"/></symbol>
	<symbol id="i-alert" viewBox="0 0 24 24"><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4m0 3v.5"/></symbol>
	<symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8v.5"/></symbol>
	<symbol id="i-inbox" viewBox="0 0 24 24"><path d="M4 13h4l2 3h4l2-3h4"/><path d="M4 13V6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6Z"/></symbol>
	<symbol id="i-rtl" viewBox="0 0 24 24"><path d="M8 5h8M8 9h8M8 13h5"/><path d="M3 20h18"/></symbol>
	<symbol id="i-cpu" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/></symbol>
	<symbol id="i-monitor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M9 21h6m-3-4v4"/></symbol>
	<symbol id="i-server" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.5M7 16.5h.5"/></symbol>
	<symbol id="i-sliders" viewBox="0 0 24 24"><path d="M5 4v7m0 4v5m7-16v3m0 4v9m7-16v11m0 4v1"/><circle cx="5" cy="13" r="2"/><circle cx="12" cy="9" r="2"/><circle cx="19" cy="17" r="2"/></symbol>
	<symbol id="i-compass" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/></symbol>
	<symbol id="i-chart" viewBox="0 0 24 24"><path d="M4 20V4"/><path d="M4 20h16"/><path d="m7 14 4-4 3 3 5-6"/></symbol>
	<symbol id="i-trophy" viewBox="0 0 24 24"><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 5H5a3 3 0 0 0 3 5M16 5h3a3 3 0 0 1-3 5"/><path d="M12 13v4m-4 3h8m-4-3v3"/></symbol>
	<symbol id="i-help" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7m0 3v.5"/></symbol>
	<symbol id="i-heart" viewBox="0 0 24 24"><path d="M12 20s-7-4.5-9-9a4.8 4.8 0 0 1 9-2.4A4.8 4.8 0 0 1 21 11c-2 4.5-9 9-9 9Z"/></symbol>
	<symbol id="i-calendar" viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="14" rx="2"/><path d="M4 10h16M8 4v4m8-4v4"/></symbol>
	<symbol id="i-disk" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/></symbol>
</svg>
