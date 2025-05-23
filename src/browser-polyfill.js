// Simple browser API compatibility layer
const browserAPI = (() => {
  if (typeof browser !== 'undefined') {
    // Firefox
    return {
      runtime: {
        onMessage: {
          addListener: browser.runtime.onMessage.addListener,
        },
        onInstalled: {
          // Create a polyfill for onInstalled in Firefox
          addListener: (callback) => {
            // In Firefox, we can emulate onInstalled
            // by checking for an installation flag in storage
            if (browser.storage && browser.storage.local) {
              browser.storage.local.get('extensionInstalled').then((result) => {
                if (!result.extensionInstalled) {
                  // First run - simulate onInstalled event
                  browser.storage.local.set({ extensionInstalled: true }).then(() => {
                    callback({ reason: 'install' });
                  });
                }
              });
            } else {
              // Fallback - just call the callback right away
              setTimeout(() => callback({ reason: 'install' }), 0);
            }
          },
        },
        sendMessage: (message) => browser.runtime.sendMessage(message),
      },
    };
  } else if (typeof chrome !== 'undefined') {
    // Chrome
    return {
      runtime: {
        onMessage: {
          addListener: (listener) => {
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
              // Handle the Promise returned by Firefox's implementation
              try {
                const response = listener(message, sender, sendResponse);
                
                // If result is a Promise, wait for it to resolve
                if (response && typeof response.then === 'function') {
                  response.then(sendResponse).catch(err => {
                    console.error('Error in message handler:', err);
                    sendResponse({ error: err.message });
                  });
                  return true; // Keep the message channel open for async response
                }
                
                return response;
              } catch (err) {
                console.error('Error in runtime.onMessage handler:', err);
                sendResponse({ error: err.message });
                return false;
              }
            });
          },
        },
        onInstalled: {
          addListener: (callback) => {
            chrome.runtime.onInstalled.addListener(callback);
          },
        },
        sendMessage: (message) => {
          return new Promise((resolve, reject) => {
            try {
              chrome.runtime.sendMessage(message, (response) => {
                const lastError = chrome.runtime.lastError;
                if (lastError) {
                  reject(new Error(lastError.message));
                } else {
                  resolve(response);
                }
              });
            } catch (err) {
              reject(err);
            }
          });
        },
      },
    };
  }
})();

export default browserAPI;
