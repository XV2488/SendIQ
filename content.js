(function init() {
  const GMAIL_ROOT_SELECTOR = 'div[role="main"]';
  const COMPOSE_WINDOW_SELECTOR = 'div[role="dialog"]';


  let settings = {
    autoIntercept: true,
    showNotifications: true
  };


  function loadSettings() {
    chrome.storage.sync.get({
      autoIntercept: true,
      showNotifications: true
    }, (items) => {
      settings = items;
    });
  }

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.autoIntercept) {
      const oldValue = settings.autoIntercept;
      settings.autoIntercept = changes.autoIntercept.newValue;
      
      console.log(`SendIQ: Auto-intercept setting changed from ${oldValue} to ${settings.autoIntercept}`);
      
      if (settings.autoIntercept) {
        enhanceAllComposeWindows();
      } else {
        removeAllInterceptions();
        enhanceAllComposeWindows();
      }
    }
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'settingsChanged') {
      settings.autoIntercept = msg.autoIntercept;
      
      if (settings.autoIntercept) {
        enhanceAllComposeWindows();
      } else {
        removeAllInterceptions();
        enhanceAllComposeWindows();
      }
    }

  });

  function removeAllInterceptions() {
    console.log('SendIQ: Removing all interceptions');
    const allSendButtons = document.querySelectorAll('[role="button"], button');
    let removedCount = 0;
    
    allSendButtons.forEach(sendBtn => {
      if (sendBtn.__gqsIntercepted) {
        console.log('SendIQ: Removing interception from send button');
        removedCount++;
        if (sendBtn._gqsInterceptHandler) {
          sendBtn.removeEventListener('click', sendBtn._gqsInterceptHandler, true);
        }
        if (sendBtn._gqsMousedownHandler) {
          sendBtn.removeEventListener('mousedown', sendBtn._gqsMousedownHandler, true);
        }
        if (sendBtn._gqsOriginalOnclick) {
          sendBtn.onclick = sendBtn._gqsOriginalOnclick;
        } else {
          sendBtn.onclick = null;
        }

        delete sendBtn._gqsOriginalOnclick;
        delete sendBtn.__gqsIntercepted;
        delete sendBtn._gqsInterceptHandler;
        delete sendBtn._gqsMousedownHandler;
        delete sendBtn._gqsKeyboardHandler;
      }
    });

    const composeDialogs = document.querySelectorAll('div[role="dialog"]');
    composeDialogs.forEach(dialog => {
      if (dialog.__gqsKeyboardHandler) {
        dialog.removeEventListener('keydown', dialog.__gqsKeyboardHandler, true);
        delete dialog.__gqsKeyboardHandler;
      }
      if (dialog.__gqsEnhanced) {
        delete dialog.__gqsEnhanced;
      }
    });
    
    console.log(`SendIQ: Removed ${removedCount} interceptions`);
  }


  const observer = new MutationObserver(() => {
    try {

    } catch (e) {
      console.error('SendIQ: Error in DOM observer:', e);
    }
  });

  function startObserver() {
    try {
      const root = document.querySelector(GMAIL_ROOT_SELECTOR) || document.body;
      observer.observe(root, { childList: true, subtree: true });
      enhanceAllComposeWindows();
      try { chrome.runtime.sendMessage({ action: 'autoAuth' }, () => {}); } catch (_) {}
      console.log('SendIQ: Observer started successfully');
      console.log('SendIQ: Extension is now active and monitoring for compose windows');
    } catch (e) {
      console.error('SendIQ: Error starting observer:', e);
    }
  }

  function enhanceAllComposeWindows() {
    setTimeout(() => {
      const composeBodies = document.querySelectorAll(COMPOSE_WINDOW_SELECTOR);
      console.log('SendIQ: Found', composeBodies.length, 'compose windows');
      
      if (composeBodies.length === 0) {
        const altComposeWindows = document.querySelectorAll('div[role="dialog"][aria-label*="Compose"], div[role="dialog"][aria-label*="compose"], div[data-tooltip*="Compose"]');
        console.log('SendIQ: Found', altComposeWindows.length, 'alternative compose windows');
        altComposeWindows.forEach((composeEl) => {
          try {
            const dialogEl = composeEl.closest('div[role="dialog"]') || composeEl;
            if (tryEnhanceCompose(dialogEl)) {
              console.log('SendIQ: Enhanced alternative compose window');
            }
          } catch (e) {
            console.error('SendIQ: Error enhancing alternative compose window:', e);
          }
        });
      }
      
      let enhancedCount = 0;
      composeBodies.forEach((composeEl) => {
        try {
          const dialogEl = composeEl.closest('div[role="dialog"]') || composeEl;
          if (tryEnhanceCompose(dialogEl)) {
            enhancedCount++;
          }
        } catch (e) {
          console.error('SendIQ: Error enhancing compose window:', e);
        }
      });
      
      if (enhancedCount > 0) {
        console.log(`SendIQ: Enhanced ${enhancedCount} compose windows`);
      }
    }, 1000); 
  }

  function tryEnhanceCompose(dialogEl) {
    if (!dialogEl || dialogEl.__gqsEnhanced) {
      return false;
    }

    console.log('SendIQ: Attempting to enhance compose dialog:', dialogEl);

    
    let toolbar = dialogEl.querySelector('div[aria-label="More options"]');
    if (toolbar) toolbar = toolbar.parentElement?.parentElement || toolbar;
    if (!toolbar) {
      const toolbars = Array.from(dialogEl.querySelectorAll('div[role="toolbar"]'));
      console.log('SendIQ: Found toolbars:', toolbars.length);
      toolbar = toolbars[toolbars.length - 1];
    }

    if (!toolbar) {
      const sendBtn = dialogEl.querySelector('div[role="button"][aria-label*="Send"], button[aria-label*="Send"], div[data-tooltip*="Send"], button[data-tooltip*="Send"]');
      if (sendBtn) {
        toolbar = sendBtn.closest('div[role="toolbar"]') || sendBtn.parentElement;
        console.log('SendIQ: Found toolbar via send button:', !!toolbar);
      }
    }
    
    const toField = dialogEl.querySelector('textarea[name="to"], input[name="to"], textarea[aria-label="To"], input[aria-label="To"], div[aria-label="To"]');
    const subjectInput = dialogEl.querySelector('input[name="subjectbox"]');
    const editorDiv = dialogEl.querySelector('div[aria-label="Message body"]') || dialogEl.querySelector('div[aria-label="Message Body"]') || dialogEl.querySelector('[contenteditable="true"][role="textbox"]');
    
    console.log('SendIQ: Found elements:', {
      toolbar: !!toolbar,
      toField: !!toField,
      subjectInput: !!subjectInput,
      editorDiv: !!editorDiv
    });
    
    if (!toField || !subjectInput || !editorDiv) {
      console.log('SendIQ: Missing required elements for compose enhancement');
      return false;
    }
    
    if (!toolbar) {
      console.log('SendIQ: No toolbar found, will try to add buttons anyway');
    }

    dialogEl.__gqsEnhanced = true;
    

    dialogEl.__gqsProcessing = false;

    addSendLaterButton(dialogEl, toField, subjectInput, editorDiv, toolbar);

    interceptGmailSend(dialogEl, toField, subjectInput, editorDiv);

    const cleanupObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.removedNodes.forEach((node) => {
          if (node === dialogEl || (node.contains && node.contains(dialogEl))) {
            console.log('SendIQ: Compose dialog removed, cleaning up');
            cleanupObserver.disconnect();
            cleanupComposeDialog(dialogEl);
          }
        });
      });
    });
    

    const parentContainer = dialogEl.parentElement || document.body;
    cleanupObserver.observe(parentContainer, { childList: true, subtree: true });
    

    dialogEl.__gqsCleanupObserver = cleanupObserver;
    
    console.log('SendIQ: Successfully enhanced compose window');
    return true;
  }

  function addSendLaterButton(dialogEl, toField, subjectInput, editorDiv, toolbar) {
    console.log('SendIQ: Adding Send Later button to dialog');

    const sendLaterBtn = document.createElement('div');
    sendLaterBtn.className = 'gqs-send-later-btn';
    sendLaterBtn.setAttribute('role', 'button');
    sendLaterBtn.setAttribute('aria-label', 'Schedule Send');
    sendLaterBtn.setAttribute('title', 'Schedule this email to send later');
    sendLaterBtn.innerHTML = `
      <svg class="gqs-send-later-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z"/>
      </svg>
    `;

    const sendBtn = dialogEl.querySelector('div[role="button"][aria-label*="Send"], button[aria-label*="Send"], div[data-tooltip*="Send"], button[data-tooltip*="send"], div[aria-label*="send"], button[data-tooltip*="send"]');
    console.log('SendIQ: Found send button:', !!sendBtn);
    
    if (sendBtn && sendBtn.parentElement) {
      console.log('SendIQ: Inserting Send Later button after send button group');
      

      let insertPosition = null;
      let currentElement = sendBtn;
      

      while (currentElement.nextSibling) {
        const nextSibling = currentElement.nextSibling;
        const nextSiblingText = nextSibling.textContent || '';
        const nextSiblingAriaLabel = nextSibling.getAttribute('aria-label') || '';
        const nextSiblingTitle = nextSibling.getAttribute('title') || '';
        const nextSiblingDataTooltip = nextSibling.getAttribute('data-tooltip') || '';
        

        const isDropdownButton = 
          nextSiblingText.includes('▼') || 
          nextSiblingText.includes('⋮') ||
          nextSiblingText.includes('More') ||
          nextSiblingAriaLabel.includes('More') || 
          nextSiblingAriaLabel.includes('Options') ||
          nextSiblingAriaLabel.includes('Send options') ||
          nextSiblingTitle.includes('More') ||
          nextSiblingTitle.includes('Options') ||
          nextSiblingTitle.includes('Send options') ||
          nextSiblingDataTooltip.includes('More') ||
          nextSiblingDataTooltip.includes('Options') ||
          nextSiblingDataTooltip.includes('Send options') ||
          nextSibling.querySelector('div[aria-label*="More"], div[aria-label*="Options"], div[aria-label*="Send options"]') ||
          nextSibling.querySelector('svg[aria-label*="More"], svg[aria-label*="Options"]') ||
          nextSibling.querySelector('[data-tooltip*="More"], [data-tooltip*="Options"]') ||
          nextSibling.querySelector('svg[data-tooltip*="More"], svg[data-tooltip*="Options"]');
        
        if (isDropdownButton) {
          insertPosition = nextSibling.nextSibling;
          console.log('SendIQ: Found dropdown button, will insert after it');
          break;
        } else {
          currentElement = nextSibling;
        }
      }
      

      if (insertPosition) {
        sendBtn.parentElement.insertBefore(sendLaterBtn, insertPosition);
        console.log('SendIQ: Send Later button positioned after send button group and dropdown');
      } else {

        sendBtn.parentElement.appendChild(sendLaterBtn);
        console.log('SendIQ: Send Later button positioned at end of container');
      }
      

      setTimeout(() => {
        const rect = sendLaterBtn.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          console.log('SendIQ: Send Later button not visible, trying alternative positioning');

          const toolbar = sendBtn.closest('div[role="toolbar"], div[style*="display: flex"]');
          if (toolbar) {
            toolbar.appendChild(sendLaterBtn);
            console.log('SendIQ: Repositioned Send Later button to toolbar');
          }
        } else {
          console.log('SendIQ: Send Later button positioned successfully at:', rect);
        }
      }, 100);
    } else if (toolbar) {
      console.log('SendIQ: Appending Send Later button to toolbar');
      toolbar.appendChild(sendLaterBtn);
    } else {
      console.error('SendIQ: Could not find suitable location for Send Later button');

      const dialogFooter = dialogEl.querySelector('div[role="toolbar"], div[style*="bottom"], div[style*="position: absolute"]');
      if (dialogFooter) {
        console.log('SendIQ: Adding Send Later button to dialog footer');
        dialogFooter.appendChild(sendLaterBtn);
      } else {

        console.log('SendIQ: Adding Send Later button to dialog as last resort');
        dialogEl.appendChild(sendLaterBtn);
      }
    }
    
    console.log('SendIQ: Send Later button added:', !!sendLaterBtn.parentElement);

    const sendLaterPopup = document.createElement('div');
    sendLaterPopup.className = 'gqs-send-later-popup';
    sendLaterPopup.innerHTML = `
      <div class="gqs-send-later-header">
        <h3>📅 Schedule Email</h3>
        <button class="gqs-close-btn" aria-label="Close">×</button>
      </div>
      <div class="gqs-send-later-content">
        <div class="gqs-schedule-option">
          <label>
            <input type="radio" name="scheduleType" value="dateTime" checked>
            <span>Send at specific date & time</span>
          </label>
        </div>
        <div class="gqs-datetime-inputs">
          <div class="gqs-date-input">
            <label>Date:</label>
            <input type="date" id="scheduleDate" min="${new Date().toISOString().split('T')[0]}" value="${new Date().toISOString().split('T')[0]}">
          </div>
        </div>
        <div class="gqs-time-input">
          <label>Time:</label>
          <input type="time" id="scheduleTime" value="${new Date(Date.now() + 2*60*60*1000).toTimeString().slice(0,5)}">
        </div>
        <div class="gqs-current-time">
          <span class="gqs-time-icon">🕐</span>
          Current time: <span id="currentTime">${new Date().toLocaleTimeString()}</span>
        </div>
        <div class="gqs-schedule-option">
          <label>
            <input type="radio" name="scheduleType" value="delay">
            <span>Send after delay</span>
          </label>
        </div>
        <div class="gqs-delay-inputs">
          <div class="gqs-delay-row">
            <input type="number" id="delayHours" min="0" max="168" value="1" placeholder="0">
            <label>hours</label>
            <input type="number" id="delayMinutes" min="0" max="59" value="0" placeholder="0">
            <label>minutes</label>
          </div>
        </div>
        <div class="gqs-quick-options">
          <button class="gqs-quick-btn" data-delay="15">15 min</button>
          <button class="gqs-quick-btn" data-delay="30">30 min</button>
          <button class="gqs-quick-btn" data-delay="60">1 hour</button>
          <button class="gqs-quick-btn" data-delay="1440">Tomorrow</button>
        </div>
        <div class="gqs-schedule-actions">
          <button class="gqs-schedule-btn gqs-primary">Schedule Email</button>
          <button class="gqs-cancel-btn">Cancel</button>
        </div>
      </div>
    `;
    

    document.body.appendChild(sendLaterPopup);
    

    dialogEl.__gqsSendLaterBtn = sendLaterBtn;
    dialogEl.__gqsSendLaterPopup = sendLaterPopup;
    

    const currentTimeEl = sendLaterPopup.querySelector('#currentTime');
    if (currentTimeEl) {
      const updateTime = () => {
        currentTimeEl.textContent = new Date().toLocaleTimeString();
      };
      

      updateTime();
      const timeInterval = setInterval(updateTime, 1000);
      

      dialogEl.__gqsTimeInterval = timeInterval;
    }
    

    sendLaterBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      console.log('SendIQ: Send Later button clicked');
      
      sendLaterPopup.classList.toggle('open');
      
      if (sendLaterPopup.classList.contains('open')) {
        console.log('SendIQ: Popup opened, positioning...');

        const rect = sendLaterBtn.getBoundingClientRect();
        const popupWidth = 380;
        const popupHeight = 500;
        

        let left = rect.left - (popupWidth / 2) + (rect.width / 2);
        if (left < 20) left = 20;
        if (left + popupWidth > window.innerWidth - 20) left = window.innerWidth - popupWidth - 20; 

        let top = rect.top - popupHeight - 100;
        
        sendLaterPopup.style.left = `${left}px`;
        sendLaterPopup.style.top = `${top}px`;

        setTimeout(() => {
          console.log('SendIQ: Adding outside click handler');
          document.addEventListener('click', outsideClickHandler, { once: true });
        }, 200);
      } else {
        console.log('SendIQ: Popup closed');
      }
    });

    const closeBtn = sendLaterPopup.querySelector('.gqs-close-btn');
    closeBtn.addEventListener('click', () => {
      sendLaterPopup.classList.remove('open');
    });
    

    const cancelBtn = sendLaterPopup.querySelector('.gqs-cancel-btn');
    cancelBtn.addEventListener('click', () => {
      sendLaterPopup.classList.remove('open');
    });
    

    const quickBtns = sendLaterPopup.querySelectorAll('.gqs-quick-btn');
    quickBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const delay = parseInt(btn.dataset.delay);
        if (delay === 1440) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(9, 0, 0, 0);
          document.getElementById('scheduleDate').value = tomorrow.toISOString().split('T')[0];
          document.getElementById('scheduleTime').value = '09:00';
          document.querySelector('input[value="dateTime"]').checked = true;
        } else {
          document.querySelector('input[value="delay"]').checked = true;
          if (delay >= 60) {
            document.getElementById('delayHours').value = Math.floor(delay / 60);
            document.getElementById('delayMinutes').value = delay % 60;
          } else {
            document.getElementById('delayHours').value = 0;
            document.getElementById('delayMinutes').value = delay;
          }
        }
      });
    });
    
    const scheduleBtn = sendLaterPopup.querySelector('.gqs-schedule-btn');
    scheduleBtn.addEventListener('click', async () => {
      const scheduleType = sendLaterPopup.querySelector('input[name="scheduleType"]:checked').value;
      let sendTime;
      
      if (scheduleType === 'dateTime') {
        const date = document.getElementById('scheduleDate').value;
        const time = document.getElementById('scheduleTime').value;
        if (!date || !time) {
          alert('Please select both date and time');
          return;
        }
        sendTime = new Date(`${date}T${time}`);
      } else {
        const hours = parseInt(document.getElementById('delayHours').value) || 0;
        const minutes = parseInt(document.getElementById('delayMinutes').value) || 0;
        if (hours === 0 && minutes === 0) {
          alert('Please enter a delay time');
          return;
        }
        sendTime = new Date(Date.now() + (hours * 60 + minutes) * 60 * 1000);
      }
      
      if (sendTime <= new Date(Date.now() + 59999)) {
        alert('Please select a time at least 1 minute in the future');
        return;
      }

      const recipients = parseRecipientsFromToField(toField, dialogEl);
      const subject = subjectInput.value || '';
      const bodyHtml = extractBodyHtml(editorDiv);
      
      if (recipients.length === 0) {
        alert('Please add at least one recipient');
        return;
      }
      
      try {
        scheduleBtn.disabled = true;
        scheduleBtn.textContent = 'Scheduling...';
        scheduleBtn.style.opacity = '0.7';
        
        const payloadRecipients = recipients.map(r => ({
          email: r.email,
          bodyHtml: personalize(bodyHtml, r.name)
        }));
        
        chrome.runtime.sendMessage({ 
          action: 'scheduleEmail', 
          recipients: payloadRecipients, 
          subject, 
          sendTime: sendTime.getTime(),
          dialogId: dialogEl.__gqsEnhanced ? 'compose-' + Date.now() : 'compose'
        }, (response) => {
          if (response && response.ok) {
            showNotification(`Email scheduled for ${sendTime.toLocaleString()}`, 'success');
            
            sendLaterPopup.classList.remove('open');

            console.log('SendIQ: Deleting draft after scheduling email');
            const subject = subjectInput.value || '';
            const bodyHtml = extractBodyHtml(editorDiv);
            const bodyText = stripHtml(bodyHtml).substring(0, 100); 

            chrome.runtime.sendMessage({ 
              action: 'deleteDraftByContent', 
              subject: subject, 
              content: bodyText 
            }, (draftResp) => {
              if (draftResp && draftResp.ok) {
                console.log('SendIQ: Draft deleted successfully via Gmail API after scheduling');
              } else {
                console.log('SendIQ: Failed to delete draft via API after scheduling:', draftResp?.error || 'Unknown error');
                
                
                if (draftResp?.errorType === 'auth_error' || draftResp?.errorType === 'permission_error') {
                  console.log('SendIQ: Trying fallback draft deletion method...');
                  chrome.runtime.sendMessage({ action: 'deleteDraft' }, (fallbackResp) => {
                    if (fallbackResp && fallbackResp.ok) {
                      console.log('SendIQ: Draft deleted successfully via fallback method');
                    } else {
                      console.log('SendIQ: Fallback draft deletion also failed:', fallbackResp?.error || 'Unknown error');
                    }
                  });
                }
              }

              
              try {
                const discardSelectors = [
                  'div[aria-label="Discard draft"]',
                  'button[aria-label="Discard draft"]',
                  'div[data-tooltip="Discard draft"]',
                  'button[data-tooltip="Discard draft"]',
                  'div[aria-label="Discard"]',
                  'button[aria-label="Discard"]',
                  'div[data-tooltip="Discard"]',
                  'button[data-tooltip="Discard"]'
                ];
                let discardBtn = null;
                for (const sel of discardSelectors) {
                  const el = (dialogEl && dialogEl.querySelector(sel)) || document.querySelector(sel);
                  if (el) { discardBtn = el; break; }
                }
                if (discardBtn) {
                  console.log('SendIQ: Clicking Gmail Discard button after API delete');
                  discardBtn.click();
                  setTimeout(() => {
                    try {
                      const confirmDialog = document.querySelector('div[role="alertdialog"], div[role="dialog"]');
                      if (confirmDialog) {
                        const btn = Array.from(confirmDialog.querySelectorAll('button, div[role="button"]'))
                          .find(b => ((b.textContent || '').toLowerCase().includes('discard') || (b.textContent || '').toLowerCase().includes('ok')));
                        if (btn) btn.click();
                      }
                    } catch (_) {}
                  }, 100);
                  return; 
                }
              } catch (_) {}
            });
            
            const closeBtnSelectors = [
              'div[aria-label="Discard draft"]',
              'button[aria-label="Discard draft"]',
              'div[data-tooltip="Discard draft"]',
              'button[data-tooltip="Discard draft"]',
              'div[aria-label="Close"]',
              'button[aria-label="Close"]',
              'div[title="Close"]',
              'button[title="Close"]'
            ];
            
            let closeBtn = null;
            for (const selector of closeBtnSelectors) {
              closeBtn = dialogEl.querySelector(selector);
              if (closeBtn) break;
            }
            
            if (closeBtn) {
              console.log('SendIQ: Closing compose window immediately after successful scheduling');
              closeBtn.click();
              setTimeout(() => {
                try {
                  const confirmDialog = document.querySelector('div[role="alertdialog"], div[role="dialog"]');
                  if (confirmDialog) {
                    const btn = Array.from(confirmDialog.querySelectorAll('button, div[role="button"]'))
                      .find(b => ((b.textContent || '').toLowerCase().includes('discard') || (b.textContent || '').toLowerCase().includes('ok')));
                    if (btn) btn.click();
                  }
                } catch (_) {}
              }, 100);
            } else {
              console.log('SendIQ: Close button not found; trying header close without hard removal');
              const headerCloseBtn = dialogEl && (dialogEl.querySelector('div[role="button"][aria-label*="Close"], div[role="button"][title*="Close"]'));
              const closeIcon = dialogEl && dialogEl.querySelector('svg[aria-label*="Close"], svg[title*="Close"]');
              const closeIconBtn = closeIcon && (closeIcon.closest('div[role="button"]') || closeIcon.parentElement);
              const candidate = headerCloseBtn || closeIconBtn;
              if (candidate) {
                candidate.click();
            setTimeout(() => {
                  try {
                    const confirmDialog = document.querySelector('div[role="alertdialog"], div[role="dialog"]');
                    if (confirmDialog) {
                      const btn = Array.from(confirmDialog.querySelectorAll('button, div[role="button"]'))
                        .find(b => ((b.textContent || '').toLowerCase().includes('discard') || (b.textContent || '').toLowerCase().includes('ok')));
                      if (btn) btn.click();
                    }
                  } catch (_) {}
                }, 100);
                    } else {
                console.log('SendIQ: No header close available; leaving dialog to avoid dirty state');
                    }
                }
          } else {
            alert('Failed to schedule email: ' + (response?.error || 'Unknown error'));
          
          }
          
          scheduleBtn.disabled = false;
          scheduleBtn.textContent = 'Schedule Email';
          scheduleBtn.style.opacity = '1';
        });
      } catch (error) {
        alert('Error scheduling email: ' + error.message);
        

        
        scheduleBtn.disabled = false;
        scheduleBtn.textContent = 'Schedule Email';
        scheduleBtn.style.opacity = '1';
      }
    });

    const outsideClickHandler = (e) => {
      console.log('SendIQ: Outside click detected', e.target);
      if (!sendLaterPopup.contains(e.target) && !sendLaterBtn.contains(e.target)) {
        console.log('SendIQ: Closing popup due to outside click');
        sendLaterPopup.classList.remove('open');
      } else {
        console.log('SendIQ: Click was inside popup or button, keeping open');
      }
    };
  }

  function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `gqs-notification gqs-notification-${type}`;
    notification.innerHTML = `
      <div class="gqs-notification-content">
        <div class="gqs-notification-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</div>
        <div class="gqs-notification-text">${message}</div>
      </div>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (notification.parentNode) notification.parentNode.removeChild(notification);
    }, 5000);
  }
  
  function cleanupComposeDialog(dialogEl) {
    if (!dialogEl) return;
    
    if (dialogEl.__gqsSendLaterBtn) {
      dialogEl.__gqsSendLaterBtn.remove();
      delete dialogEl.__gqsSendLaterBtn;
    }
    
    if (dialogEl.__gqsSendLaterPopup) {
      dialogEl.__gqsSendLaterPopup.remove();
      delete dialogEl.__gqsSendLaterPopup;
    }
    
    if (dialogEl.__gqsDraftPreventionInterval) {
      clearInterval(dialogEl.__gqsDraftPreventionInterval);
      delete dialogEl.__gqsDraftPreventionInterval;
    }
    
    if (dialogEl.__gqsTimeInterval) {
      clearInterval(dialogEl.__gqsTimeInterval);
      delete dialogEl.__gqsTimeInterval;
    }
    
    delete dialogEl.__gqsEnhanced;
    delete dialogEl.__gqsProcessing;
    delete dialogEl.__gqsCleanupObserver;
    delete dialogEl.__gqsOutsideClickHandler;
    

    if (dialogEl.__gqsTimeInterval) {
      clearInterval(dialogEl.__gqsTimeInterval);
      delete dialogEl.__gqsTimeInterval;
    }
    

    if (dialogEl.__gqsMutationObserver) {
      dialogEl.__gqsMutationObserver.disconnect();
      delete dialogEl.__gqsMutationObserver;
    }
    
    const sendBtn = dialogEl.querySelector('div[role="button"][aria-label*="Send"], button[aria-label*="Send"]');
    if (sendBtn && sendBtn._gqsOriginalOnclick) {
      if (sendBtn._gqsInterceptHandler) {
        sendBtn.removeEventListener('click', sendBtn._gqsInterceptHandler, true);
      }
      if (sendBtn._gqsMousedownHandler) {
        sendBtn.removeEventListener('mousedown', sendBtn._gqsMousedownHandler, true);
      }
      if (sendBtn._gqsKeyboardHandler) {
        dialogEl.removeEventListener('keydown', sendBtn._gqsKeyboardHandler, true);
      }
      

      sendBtn.onclick = sendBtn._gqsOriginalOnclick;
      

      delete sendBtn._gqsOriginalOnclick;
      delete sendBtn._gqsIntercepted;
      delete sendBtn._gqsInterceptHandler;
      delete sendBtn._gqsMousedownHandler;
      delete sendBtn._gqsKeyboardHandler;
    }
  }

  function interceptGmailSend(dialogEl, toField, subjectInput, editorDiv) {
    
    if (!settings.autoIntercept) {
      console.log('SendIQ: Auto-intercept is disabled, skipping send button interception');
      return;
    }
    
    
    const sendBtnSelectors = [
      'div[role="button"][aria-label*="Send"]',
      'div[role="button"][aria-label*="send"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="send"]',
      'div[data-tooltip*="Send"]',
      'div[data-tooltip*="send"]',
      'div[title*="Send"]',
      'div[title*="send"]'
    ];
    
    let sendBtn = null;
    for (const selector of sendBtnSelectors) {
      sendBtn = dialogEl.querySelector(selector);
      if (sendBtn) break;
    }
    
    if (!sendBtn || sendBtn.__gqsIntercepted) return;
    
    sendBtn.__gqsIntercepted = true;
    
    
    if (sendBtn.onclick) {
      sendBtn._gqsOriginalOnclick = sendBtn.onclick;
    }
    
    
    const interceptHandler = async (e) => {
      
      if (dialogEl.__gqsProcessing) {
        console.log('SendIQ: Already processing a send request, ignoring');
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      }
      
      
      const recipients = parseRecipientsFromToField(toField, dialogEl);
      console.log('SendIQ: Send button clicked, recipients found:', recipients.length);
      
      if (recipients.length <= 1) {
        
        console.log('SendIQ: Single recipient, allowing Gmail to handle normally');
        return;
      }
      
      
      console.log('SendIQ: Multiple recipients detected, sending individually');
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      
      dialogEl.__gqsProcessing = true;
      
      
      try {
        console.log('SendIQ: Attempting to access Gmail internal API');
        
        
        if (window.gmail) {
          console.log('SendIQ: Found window.gmail object');
          
          
          let gmailCompose = null;
          
          
          const possiblePaths = [
            'window.gmail.compose',
            'window.gmail.get.compose.data()',
            'window.gmail.get.compose',
            'window.gmail.compose.data',
            'window.gmail.compose.state',
            'window.gmail.get.compose.state'
          ];
          
          for (const path of possiblePaths) {
            try {
              const result = eval(path);
              if (result && typeof result === 'object') {
                gmailCompose = result;
                console.log('SendIQ: Found compose object via path:', path);
                break;
              }
            } catch (e) {
              
            }
          }
          
          if (gmailCompose) {
            console.log('SendIQ: Found Gmail compose object:', gmailCompose);
            
            
            if (typeof gmailCompose.markAsSent === 'function') {
              console.log('SendIQ: Calling markAsSent() method');
              gmailCompose.markAsSent();
            } else if (gmailCompose.state !== undefined) {
              console.log('SendIQ: Setting compose state to sent');
              gmailCompose.state = 'sent';
            } else if (gmailCompose.status !== undefined) {
              console.log('SendIQ: Setting compose status to sent');
              gmailCompose.status = 'sent';
            }
          }
        }
        
        
        try {
          
          const composeId = dialogEl.getAttribute('data-compose-id') || 
                           dialogEl.querySelector('[data-compose-id]')?.getAttribute('data-compose-id') ||
                           dialogEl.querySelector('[data-legacy-compose-id]')?.getAttribute('data-legacy-compose-id');
          
          if (composeId) {
            console.log('SendIQ: Found compose ID:', composeId);
            
            
            if (window.gmail && window.gmail.compose && window.gmail.compose.composes) {
              const compose = window.gmail.compose.composes[composeId];
              if (compose) {
                console.log('SendIQ: Found compose in registry, marking as sent');
                if (typeof compose.markAsSent === 'function') {
                  compose.markAsSent();
                } else if (compose.state !== undefined) {
                  compose.state = 'sent';
                }
              }
            }
          }
        } catch (e) {
          console.log('SendIQ: Could not find compose ID:', e);
        }
        
        
        try {
          
          if (window.gmail && window.gmail.observe) {
            console.log('SendIQ: Found Gmail observe method, triggering send completion');
            
            if (typeof window.gmail.observe.on === 'function') {
              window.gmail.observe.on('send_email', () => {
                console.log('SendIQ: Gmail send_email event triggered');
              });
            }
          }
        } catch (e) {
          console.log('SendIQ: Could not trigger Gmail internal events:', e);
        }
        
        
        try {
          
          const composeData = dialogEl.__reactProps$ || 
                             dialogEl._reactProps$ || 
                             dialogEl._reactInternalInstance ||
                             dialogEl._reactInternalFiber;
          
          if (composeData) {
            console.log('SendIQ: Found React internal data, attempting to modify state');
            
            let current = composeData;
            while (current) {
              if (current.stateNode && current.stateNode.state) {
                const state = current.stateNode.state;
                if (state.composeState || state.status) {
                  console.log('SendIQ: Found compose state in React, marking as sent');
                  if (state.composeState) state.composeState = 'sent';
                  if (state.status) state.status = 'sent';
                  break;
                }
              }
              current = current.return || current._return;
            }
          }
          
          
          const findReactFiber = (element) => {
            const keys = Object.keys(element);
            for (const key of keys) {
              if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) {
                return element[key];
              }
            }
            return null;
          };
          
          const fiber = findReactFiber(dialogEl);
          if (fiber) {
            console.log('SendIQ: Found React Fiber, traversing to find compose state');
            let current = fiber;
            while (current) {
              if (current.stateNode && current.stateNode.state) {
                const state = current.stateNode.state;
                if (state.composeState || state.status || state.mode) {
                  console.log('SendIQ: Found state in React Fiber:', state);
                  if (state.composeState) state.composeState = 'sent';
                  if (state.status) state.status = 'sent';
                  if (state.mode) state.mode = 'sent';
                  break;
                }
              }
              current = current.return;
            }
          }
        } catch (e) {
          console.log('SendIQ: Could not access React internal data:', e);
        }
        
        
        try {
          console.log('SendIQ: Searching for Gmail global state objects');
          
          
          const globalObjects = [
            'window.GM_STATE',
            'window.GM_ACTION',
            'window.GM_ACTION_QUEUE',
            'window.GM_COMPOSE_STATE',
            'window.GMAIL_STATE',
            'window.GMAIL_COMPOSE',
            'window.GMAIL_ACTION',
            'window.GMAIL_ACTION_QUEUE'
          ];
          
          for (const objPath of globalObjects) {
            try {
              const obj = eval(objPath);
              if (obj && typeof obj === 'object') {
                console.log('SendIQ: Found global object:', objPath, obj);
                
                
                if (obj.compose && obj.compose.state) {
                  console.log('SendIQ: Found compose state in global object, marking as sent');
                  obj.compose.state = 'sent';
                }
                
                if (obj.composeState) {
                  console.log('SendIQ: Found composeState in global object, marking as sent');
                  obj.composeState = 'sent';
                }
                
                if (obj.currentCompose) {
                  console.log('SendIQ: Found currentCompose in global object, marking as sent');
                  if (obj.currentCompose.state) obj.currentCompose.state = 'sent';
                  if (obj.currentCompose.status) obj.currentCompose.status = 'sent';
                }
              }
            } catch (e) {
              
            }
          }
        } catch (e) {
          console.log('SendIQ: Could not access Gmail global state:', e);
        }
        
        
        try {
          console.log('SendIQ: Searching for Gmail action queue and compose actions');
          
          
          const actionQueuePaths = [
            'window.GM_ACTION_QUEUE',
            'window.GMAIL_ACTION_QUEUE',
            'window.gmail.actionQueue',
            'window.gmail.action_queue',
            'window.gmail.actions',
            'window.gmail.action'
          ];
          
          for (const path of actionQueuePaths) {
            try {
              const actionQueue = eval(path);
              if (actionQueue && typeof actionQueue === 'object') {
                console.log('SendIQ: Found action queue:', path, actionQueue);
                
                
                if (actionQueue.composeActions) {
                  console.log('SendIQ: Found compose actions in action queue');
                  for (const action of actionQueue.composeActions) {
                    if (action.type === 'compose' || action.type === 'send') {
                      console.log('SendIQ: Marking compose action as completed');
                      action.status = 'completed';
                      action.completed = true;
                    }
                  }
                }
                
                
                if (actionQueue.currentAction && actionQueue.currentAction.type === 'compose') {
                  console.log('SendIQ: Marking current compose action as completed');
                  actionQueue.currentAction.status = 'completed';
                  actionQueue.currentAction.completed = true;
                }
              }
            } catch (e) {
              
            }
          }
        } catch (e) {
          console.log('SendIQ: Could not access Gmail action queue:', e);
        }
        
        
        try {
          console.log('SendIQ: Searching for compose elements with data attributes');
          
          
          const composeElements = dialogEl.querySelectorAll('[data-compose-id], [data-legacy-compose-id], [data-gmail-compose], [data-compose-state]');
          console.log('SendIQ: Found compose elements with data attributes:', composeElements.length);
          
          for (const element of composeElements) {
            try {
              
              if (element.hasAttribute('data-compose-state')) {
                console.log('SendIQ: Setting data-compose-state to sent');
                element.setAttribute('data-compose-state', 'sent');
              }
              
              if (element.hasAttribute('data-compose-status')) {
                console.log('SendIQ: Setting data-compose-status to sent');
                element.setAttribute('data-compose-status', 'sent');
              }
              
              
              const internalData = element.__reactProps$ || element._reactProps$ || element._reactInternalInstance;
              if (internalData) {
                console.log('SendIQ: Found internal data on compose element');
                
                let current = internalData;
                while (current) {
                  if (current.stateNode && current.stateNode.state) {
                    const state = current.stateNode.state;
                    if (state.composeState || state.status) {
                      console.log('SendIQ: Found state in compose element, marking as sent');
                      if (state.composeState) state.composeState = 'sent';
                      if (state.status) state.status = 'sent';
                      break;
                    }
                  }
                  current = current.return || current._return;
                }
              }
            } catch (e) {
              console.log('SendIQ: Error processing compose element:', e);
            }
          }
        } catch (e) {
          console.log('SendIQ: Could not process compose elements:', e);
        }
        
        
        try {
          console.log('SendIQ: Dispatching custom events to simulate Gmail send completion');
          
          
          const sendEvent = new CustomEvent('gmail-send-email', {
            bubbles: true,
            detail: {
              to: recipients[0].email,
              subject: subjectInput.value || '',
              body: editorDiv.innerHTML || '',
              timestamp: Date.now()
            }
          });
          dialogEl.dispatchEvent(sendEvent);
          
          
          const composeCompleteEvent = new CustomEvent('gmail-compose-complete', {
            bubbles: true,
            detail: { status: 'sent' }
          });
          dialogEl.dispatchEvent(composeCompleteEvent);
          
          
          const discardEvent = new CustomEvent('gmail-discard-draft', {
            bubbles: true,
            detail: { composeId: dialogEl.getAttribute('data-compose-id') }
          });
          dialogEl.dispatchEvent(discardEvent);
          
        } catch (e) {
          console.log('SendIQ: Could not dispatch custom events:', e);
        }
        
              } catch (err) {
          console.log('SendIQ: Error accessing Gmail internal API:', err);
        }
        
        
        try {
          console.log('SendIQ: Final attempt to find Gmail internal state');
          
          
          const remainingPaths = [
            'window.GM_COMPOSE',
            'window.GMAIL_COMPOSE_STATE',
            'window.GM_COMPOSE_STATE',
            'window.GMAIL_COMPOSE_DATA',
            'window.GM_COMPOSE_DATA',
            'window.GMAIL_CURRENT_COMPOSE',
            'window.GM_CURRENT_COMPOSE'
          ];
          
          for (const path of remainingPaths) {
            try {
              const obj = eval(path);
              if (obj && typeof obj === 'object') {
                console.log('SendIQ: Found remaining global object:', path, obj);
                
                
                if (obj.state !== undefined) {
                  console.log('SendIQ: Setting state to sent in remaining object');
                  obj.state = 'sent';
                }
                
                if (obj.status !== undefined) {
                  console.log('SendIQ: Setting status to sent in remaining object');
                  obj.status = 'sent';
                }
                
                if (obj.mode !== undefined) {
                  console.log('SendIQ: Setting mode to sent in remaining object');
                  obj.mode = 'sent';
                }
              }
            } catch (e) {
              
            }
          }
        } catch (e) {
          console.log('SendIQ: Could not access remaining Gmail state:', e);
        }
      
      
      console.log('SendIQ: Waiting for Gmail internal state to update...');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      
      const closeBtnSelectors = [
        'div[aria-label="Discard draft"]',
        'button[aria-label="Discard draft"]',
        'div[data-tooltip="Discard draft"]',
        'button[data-tooltip="Discard draft"]',
        'div[aria-label="Close"]',
        'button[aria-label="Close"]',
        'div[title="Close"]',
        'button[title="Close"]',
        'div[aria-label="Discard"]',
        'button[aria-label="Discard"]',
        'div[data-tooltip="Discard"]',
        'button[data-tooltip="Discard"]'
      ];
      
      let closeBtn = null;
      for (const selector of closeBtnSelectors) {
        closeBtn = dialogEl.querySelector(selector);
        if (closeBtn) break;
      }
      
      if (closeBtn) {
        console.log('SendIQ: Closing compose window after marking as sent');
        closeBtn.click();
      } else {
        
        const headerCloseBtn = dialogEl.querySelector('div[role="button"][aria-label*="Close"], div[role="button"][aria-label*="close"], div[role="button"][title*="Close"], div[role="button"][title*="close"]');
        if (headerCloseBtn) {
          console.log('SendIQ: Found header close button, clicking it');
          headerCloseBtn.click();
        } else {
          
          const closeIcon = dialogEl.querySelector('svg[aria-label*="Close"], svg[aria-label*="close"], svg[title*="Close"], svg[title*="close"]');
          if (closeIcon) {
            const closeButton = closeIcon.closest('div[role="button"]') || closeIcon.parentElement;
            if (closeButton) {
              console.log('SendIQ: Found close icon, clicking its container');
              closeButton.click();
            }
          } else {
            
            const allButtons = dialogEl.querySelectorAll('div[role="button"], button');
            for (const btn of allButtons) {
              const text = btn.textContent || btn.getAttribute('aria-label') || btn.getAttribute('title') || '';
              if (text.includes('Close') || text.includes('close') || text.includes('✕') || text.includes('×') || text.includes('X')) {
                console.log('SendIQ: Found close button by text, clicking it');
                btn.click();
                break;
              }
            }
          }
        }
      }
      
      
      try {
        const discardEvent = new CustomEvent('gmail-discard-draft', { bubbles: true });
        dialogEl.dispatchEvent(discardEvent);
        console.log('SendIQ: Dispatched custom discard draft event');
      } catch (e) {
        console.log('SendIQ: Could not dispatch custom event');
      }
      
      
      try {
        const escapeEvent = new KeyboardEvent('keydown', {
          key: 'Escape',
          keyCode: 27,
          which: 27,
          bubbles: true,
          cancelable: true
        });
        dialogEl.dispatchEvent(escapeEvent);
        console.log('SendIQ: Dispatched Escape key event');
      } catch (e) {
        console.log('SendIQ: Could not dispatch Escape key event');
      }
      
      
      if (sendBtn) {
        sendBtn.style.pointerEvents = 'none';
        sendBtn.style.opacity = '0.6';
      }
      
      
      let notification = null;
      if (settings.showNotifications) {
        notification = document.createElement('div');
        notification.className = 'gqs-notification';
        notification.innerHTML = `
          <div class="gqs-notification-content">
            <div class="gqs-notification-icon">✉️</div>
            <div class="gqs-notification-text">Sending ${recipients.length} individual emails...</div>
          </div>
        `;
        document.body.appendChild(notification);
      }
      
      try {
        const subject = subjectInput.value || '';
        const bodyHtml = extractBodyHtml(editorDiv);
        
        const payloadRecipients = recipients.map(r => ({
          email: r.email,
          bodyHtml: personalize(bodyHtml, r.name)
        }));
        
        
        chrome.runtime.sendMessage({ action: 'sendEmails', recipients: payloadRecipients, subject, delayMs: 5 }, (resp) => {
          
          dialogEl.__gqsProcessing = false;
          
          
          if (sendBtn) {
            sendBtn.style.pointerEvents = '';
            sendBtn.style.opacity = '';
          }
          
          if (resp && resp.ok) {
            
            if (notification && settings.showNotifications) {
              notification.innerHTML = `
                <div class="gqs-notification-content">
                  <div class="gqs-notification-icon">🚀</div>
                  <div class="gqs-notification-text">Mass send started! ${recipients.length} emails will be sent in the background.</div>
                </div>
              `;
              notification.classList.add('success');
            }
            
            
            console.log('SendIQ: Deleting draft after successful send');
            const subject = subjectInput.value || '';
            const bodyHtml = extractBodyHtml(editorDiv);
            const bodyText = stripHtml(bodyHtml).substring(0, 100); 
            
            chrome.runtime.sendMessage({ 
              action: 'deleteDraftByContent', 
              subject: subject, 
              content: bodyText 
            }, (draftResp) => {
              if (draftResp && draftResp.ok) {
                console.log('SendIQ: Draft deleted successfully via Gmail API');
              } else {
                console.log('SendIQ: Failed to delete draft via API:', draftResp?.error || 'Unknown error');
                
                
                if (draftResp?.errorType === 'auth_error' || draftResp?.errorType === 'permission_error') {
                  console.log('SendIQ: Trying fallback draft deletion method...');
                  chrome.runtime.sendMessage({ action: 'deleteDraft' }, (fallbackResp) => {
                    if (fallbackResp && fallbackResp.ok) {
                      console.log('SendIQ: Draft deleted successfully via fallback method');
                    } else {
                      console.log('SendIQ: Fallback draft deletion also failed:', fallbackResp?.error || 'Unknown error');
                    }
                  });
                }
              }

              
              try {
                const discardSelectors = [
                  'div[aria-label="Discard draft"]',
                  'button[aria-label="Discard draft"]',
                  'div[data-tooltip="Discard draft"]',
                  'button[data-tooltip="Discard draft"]',
                  'div[aria-label="Discard"]',
                  'button[aria-label="Discard"]',
                  'div[data-tooltip="Discard"]',
                  'button[data-tooltip="Discard"]'
                ];
                let discardBtn = null;
                for (const sel of discardSelectors) {
                  const el = (dialogEl && dialogEl.querySelector(sel)) || document.querySelector(sel);
                  if (el) { discardBtn = el; break; }
                }
                if (discardBtn) {
                  console.log('SendIQ: Clicking Gmail Discard button after API delete');
                  discardBtn.click();
                  setTimeout(() => {
                    try {
                      const confirmDialog = document.querySelector('div[role="alertdialog"], div[role="dialog"]');
                      if (confirmDialog) {
                        const btn = Array.from(confirmDialog.querySelectorAll('button, div[role="button"]'))
                          .find(b => ((b.textContent || '').toLowerCase().includes('discard') || (b.textContent || '').toLowerCase().includes('ok')));
                        if (btn) btn.click();
                      }
                    } catch (_) {}
                  }, 100);
                  return; 
                }
              } catch (_) {}
            });
            
            
            const closeBtnSelectors = [
              'div[aria-label="Discard draft"]',
              'button[aria-label="Discard draft"]',
              'div[data-tooltip="Discard draft"]',
              'button[data-tooltip="Discard draft"]',
              'div[aria-label="Close"]',
              'button[aria-label="Close"]',
              'div[title="Close"]',
              'button[title="Close"]'
            ];
            
            let closeBtn = null;
            for (const selector of closeBtnSelectors) {
              closeBtn = dialogEl.querySelector(selector);
              if (closeBtn) break;
            }
            
            if (closeBtn) {
              console.log('SendIQ: Closing compose window immediately after successful send');
              closeBtn.click();
              
              setTimeout(() => {
                try {
                  const confirmDialog = document.querySelector('div[role="alertdialog"], div[role="dialog"]');
                  if (confirmDialog) {
                    const btn = Array.from(confirmDialog.querySelectorAll('button, div[role="button"]'))
                      .find(b => ((b.textContent || '').toLowerCase().includes('discard') || (b.textContent || '').toLowerCase().includes('ok')));
                    if (btn) btn.click();
                  }
                } catch (_) {}
              }, 100);
            } else {
              console.log('SendIQ: Close button not found; trying header close without hard removal');
              
              const headerCloseBtn = dialogEl && (dialogEl.querySelector('div[role="button"][aria-label*="Close"], div[role="button"][title*="Close"]'));
              const closeIcon = dialogEl && dialogEl.querySelector('svg[aria-label*="Close"], svg[title*="Close"]');
              const closeIconBtn = closeIcon && (closeIcon.closest('div[role="button"]') || closeIcon.parentElement);
              const candidate = headerCloseBtn || closeIconBtn;
              if (candidate) {
                candidate.click();
            setTimeout(() => {
                  try {
                    const confirmDialog = document.querySelector('div[role="alertdialog"], div[role="dialog"]');
                    if (confirmDialog) {
                      const btn = Array.from(confirmDialog.querySelectorAll('button, div[role="button"]'))
                        .find(b => ((b.textContent || '').toLowerCase().includes('discard') || (b.textContent || '').toLowerCase().includes('ok')));
                      if (btn) btn.click();
                    }
                  } catch (_) {}
                }, 100);
                    } else {
                console.log('SendIQ: No header close available; leaving dialog to avoid dirty state');
                    }
                }
          } else {
            if (notification && settings.showNotifications) {
              notification.innerHTML = `
                <div class="gqs-notification-content">
                  <div class="gqs-notification-icon">❌</div>
                  <div class="gqs-notification-text">Error: ${resp?.error || 'Failed to send'}</div>
                </div>
              `;
              notification.classList.add('error');
            }
          }
          
          
          if (notification && settings.showNotifications) {
            setTimeout(() => {
              if (notification.parentNode) notification.parentNode.removeChild(notification);
            }, 5000);
          }
        });
      } catch (err) {
        
        dialogEl.__gqsProcessing = false;
        
        
        if (sendBtn) {
          sendBtn.style.pointerEvents = '';
          sendBtn.style.opacity = '';
        }
        
        if (notification && settings.showNotifications) {
          notification.innerHTML = `
            <div class="gqs-notification-content">
              <div class="gqs-notification-icon">❌</div>
              <div class="gqs-notification-text">Error: ${err.message || 'Failed to send'}</div>
            </div>
          `;
          notification.classList.add('error');
          setTimeout(() => {
            if (notification.parentNode) notification.parentNode.removeChild(notification);
          }, 5000);
        }
      }
      
      
      return false;
    };
    
    
    sendBtn.onclick = interceptHandler;
    
    
    sendBtn.addEventListener('click', interceptHandler, true); 
    
    
    const mousedownHandler = (e) => {
      const recipients = parseRecipientsFromToField(toField, dialogEl);
      if (recipients.length > 1) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      }
    };
    
    sendBtn.addEventListener('mousedown', mousedownHandler, true);
    
    
    const preventSendShortcuts = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const recipients = parseRecipientsFromToField(toField, dialogEl);
        if (recipients.length > 1) {
          console.log('SendIQ: Preventing Ctrl+Enter send for multiple recipients');
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return false;
        }
      }
    };
    
    dialogEl.addEventListener('keydown', preventSendShortcuts, true);
    
    
    sendBtn._gqsInterceptHandler = interceptHandler;
    sendBtn._gqsMousedownHandler = mousedownHandler;
    sendBtn._gqsKeyboardHandler = preventSendShortcuts;
  }

  function setStatus(el, text) {
    if (el) el.textContent = text;
  }

  function parseRecipients(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return [];
    const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const parsed = [];
    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim()).filter(Boolean);
      for (const p of parts) {
        const [emailPart, namePart] = p.split('|').map(s => s && s.trim());
        if (!emailPart) continue;
        parsed.push({ email: emailPart, name: namePart || '' });
      }
    }
    return parsed;
  }

  function parseRecipientsFromToField(toField, dialogEl) {
    
    const emails = new Set();
    
    
    const scope = (toField && toField.closest('div[role="dialog"]')) || dialogEl || document;
    const attrChips = scope.querySelectorAll('span[email], div[email], *[data-hovercard-id]');
    attrChips.forEach(chip => {
      const email = chip.getAttribute('email') || chip.getAttribute('data-hovercard-id');
      if (!email || !/@/.test(email)) return;
      const text = chip.textContent || '';
      const name = text.replace(/<[^>]+>/g, '').replace(email, '').trim();
      emails.add(JSON.stringify({ email, name }));
    });
    
    
    if (emails.size === 0) {
      const linkChips = scope.querySelectorAll('div[aria-label="To"] div[role="link"], div[aria-label="to"] div[role="link"]');
      linkChips.forEach(chip => {
        const title = chip.getAttribute('title') || chip.textContent || '';
        const match = title.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
        if (match) {
          const email = match[0];
          const name = title.replace(email, '').replace(/[<>]/g, '').trim();
          emails.add(JSON.stringify({ email, name }));
        }
      });
    }
    
    
    if (emails.size === 0) {
      const emailChips = scope.querySelectorAll('div[role="listbox"] div[role="option"], div[role="listbox"] div[role="button"]');
      emailChips.forEach(chip => {
        const text = chip.textContent || chip.getAttribute('title') || '';
        const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
        if (match) {
          const email = match[0];
          const name = text.replace(email, '').replace(/[<>]/g, '').trim();
          emails.add(JSON.stringify({ email, name }));
        }
      });
    }
    
    
    if (emails.size === 0) {
      const raw = toField?.value || toField?.textContent || '';
      raw.split(/[;,]/).map(s => s.trim()).filter(Boolean).forEach(token => {
        
        const match = token.match(/<([^>]+)>/);
        let email = token;
        let name = '';
        if (match) {
          email = match[1];
          name = token.replace(/<[^>]+>/, '').trim();
        }
        
        if (/@/.test(email) && /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email)) {
          emails.add(JSON.stringify({ email, name }));
        }
      });
    }
    
    const result = Array.from(emails).map(s => JSON.parse(s)).filter(r => /@/.test(r.email));
    
    
    if (result.length > 1) {
      console.log('SendIQ: Found multiple recipients:', result);
    }
    
    return result;
  }

  function extractBodyHtml(editorDiv) {
    
    return editorDiv?.innerHTML || '';
  }

  function personalize(template, name) {
    return (template || '').replaceAll('{{name}}', name || '');
  }

  function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html || '';
    return (tmp.textContent || tmp.innerText || '').trim();
  }

  
  loadSettings();
  
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }
  
  console.log('SendIQ: Content script loaded and initialized');
})();

