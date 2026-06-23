(function() {
  const CHECK_INTERVAL = 60000; // Check every 60 seconds
  let isChecking = false;

  async function checkVersion() {
    if (isChecking) return;
    isChecking = true;

    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Network response was not ok');
      const data = await res.json();
      
      const lastKnownVersion = localStorage.getItem('vanba_last_version');
      
      if (!lastKnownVersion) {
        // First visit, just store the version
        localStorage.setItem('vanba_last_version', data.version);
      } else if (data.version && data.version !== lastKnownVersion) {
        console.log('[VANBA Cache Buster] New version detected:', data.version);
        
        // Show the banner
        showUpdateBanner();
        
        // Update the stored version
        localStorage.setItem('vanba_last_version', data.version);

        // 1. Unregister Service Workers
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (let registration of registrations) {
            await registration.unregister();
          }
        }

        // 2. Clear all caches API caches
        if ('caches' in window) {
          const cacheNames = await caches.keys();
          for (let cacheName of cacheNames) {
            await caches.delete(cacheName);
          }
        }

        // 3. Clear session storage
        sessionStorage.clear();

        // 4. Force hard reload after a short delay so user can see the banner
        setTimeout(() => {
          window.location.reload(true);
        }, 2500);
      }
    } catch (err) {
      console.warn('[VANBA Cache Buster] Failed to check version:', err);
    } finally {
      isChecking = false;
    }
  }

  function showUpdateBanner() {
    const banner = document.createElement('div');
    banner.style.position = 'fixed';
    banner.style.top = '0';
    banner.style.left = '0';
    banner.style.width = '100%';
    banner.style.backgroundColor = '#10b981'; // Green accent
    banner.style.color = '#ffffff';
    banner.style.textAlign = 'center';
    banner.style.padding = '14px';
    banner.style.fontFamily = 'Space Grotesk, sans-serif';
    banner.style.fontWeight = '700';
    banner.style.zIndex = '999999';
    banner.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
    banner.innerHTML = `New Version Available!<br/><span style="font-size: 0.85em; font-weight: 500; opacity: 0.9;">Refreshing to show latest features...</span>`;
    document.body.appendChild(banner);
  }

  // Check on load
  checkVersion();

  // Check on visibility change (when user switches back to the tab)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkVersion();
    }
  });

  // Polling check
  setInterval(checkVersion, CHECK_INTERVAL);

  // Register SW on load
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(err => {
        console.warn('[VANBA SW] Registration failed:', err);
      });
    });
  }
})();
