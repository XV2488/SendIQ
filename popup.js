document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');
  const openGmailBtn = document.getElementById('openGmailBtn');
  const accountEl = document.getElementById('account');
  const autoInterceptCheckbox = document.getElementById('autoIntercept');
  const scheduledCountEl = document.getElementById('scheduledCount');
  const refreshScheduledBtn = document.getElementById('refreshScheduledBtn');
  const clearAllScheduledBtn = document.getElementById('clearAllScheduledBtn');
  const nextScheduledTimeEl = document.getElementById('nextScheduledTime');
  const nextScheduledTextEl = document.getElementById('nextScheduledText');
  const scheduledSummaryEl = document.getElementById('scheduledSummary');
  const scheduledSummaryTextEl = document.getElementById('scheduledSummaryText');
  const currentTimeEl = document.getElementById('currentTime');


  loadSettings();
  

  loadScheduledEmails();
  

  if (scheduledCountEl) scheduledCountEl.textContent = '...';

  let refreshInterval;
  setInterval(() => {
    if (document.visibilityState !== 'hidden') {
      loadScheduledEmails();
    }
  }, 15000);
  

  if (currentTimeEl) {
    const updateCurrentTime = () => {
      const now = new Date();
      currentTimeEl.textContent = now.toLocaleTimeString();
    };
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
  }
  

  chrome.runtime.sendMessage({ action: 'autoAuth' }, (resp) => {
  });
  
  chrome.runtime.sendMessage({ action: 'getAccount' }, (resp) => {
    if (resp && resp.ok) {
      const name = resp.name || '';
      const email = resp.email || '';
      accountEl.textContent = email ? `${name ? name + ' ' : ''}${email}` : '';
    }
  });


  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'scheduledEmailsChanged') {
      updateScheduledEmailsDisplay(msg.scheduledEmails || []);
    } else if (msg.action === 'massSendCompleted') {
      showStatus(`Mass send completed: ${msg.successful}/${msg.totalRecipients} emails sent successfully`, 'success');
    } else if (msg.action === 'massSendError') {
      showStatus(`Mass send failed: ${msg.error}`, 'error');
    }
  });

  openGmailBtn?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://mail.google.com/mail/u/0/#inbox' });
  });


  refreshScheduledBtn?.addEventListener('click', () => {
    refreshScheduledBtn.disabled = true;
    refreshScheduledBtn.querySelector('.btn-icon').textContent = '⏳';
    refreshScheduledBtn.querySelector('.btn-text').textContent = 'Refreshing...';
    
    loadScheduledEmails();
    
    setTimeout(() => {
      refreshScheduledBtn.disabled = false;
      refreshScheduledBtn.querySelector('.btn-icon').textContent = '↻';
      refreshScheduledBtn.querySelector('.btn-text').textContent = 'Refresh';
    }, 1000);
  });

  clearAllScheduledBtn?.addEventListener('click', () => {
    if (confirm('Are you sure you want to cancel all scheduled emails? This action cannot be undone.')) {
      chrome.storage.local.set({ scheduledEmails: [] }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error clearing emails:', chrome.runtime.lastError);
          showStatus('Failed to clear emails', 'error');
          return;
        }
        updateScheduledEmailsDisplay([]);
        showStatus('All scheduled emails have been cancelled', 'success');
      });
    }
  });


  function loadScheduledEmails() {
    chrome.storage.local.get(['scheduledEmails'], (result) => {
      try {
        const scheduledEmails = result.scheduledEmails || [];
        updateScheduledEmailsDisplay(scheduledEmails);
      } catch (error) {
        console.error('Error loading scheduled emails:', error);
        if (scheduledCountEl) scheduledCountEl.textContent = 'Error';
        showStatus('Failed to load scheduled emails', 'error');
      }
    });
  }

  let lastUpdateTime = 0;
  function updateScheduledEmailsDisplay(scheduledEmails) {
    if (!scheduledCountEl || !clearAllScheduledBtn) return;
    
    const currentTime = Date.now();
    if (currentTime - lastUpdateTime < 500) {
      return;
    }
    lastUpdateTime = currentTime;
    if (scheduledEmails.length === 0) {
      scheduledCountEl.textContent = '0';
      scheduledCountEl.style.fontWeight = 'normal';
    } else {
      scheduledCountEl.textContent = scheduledEmails.length;
      scheduledCountEl.style.fontWeight = 'bold';
    }
    
    const now = new Date();
    const overdueCount = scheduledEmails.filter(email => {
      try {
        const sendTime = new Date(email.sendTime);
        return sendTime < (now.getTime() - 120000);
      } catch (error) {
        console.error('Error parsing send time:', error);
        return false;
      }
    }).length;
    
    if (overdueCount > 0) {
      scheduledCountEl.style.color = '#dc3545';
      scheduledCountEl.title = `${overdueCount} email(s) overdue`;
    } else {
      scheduledCountEl.style.color = '';
      scheduledCountEl.title = '';
    }
    if (scheduledEmails.length > 0 && nextScheduledTimeEl && nextScheduledTextEl) {
      try {
        const nextEmail = scheduledEmails
          .filter(email => {
            const sendTime = new Date(email.sendTime);
            return sendTime > now;
          })
          .sort((a, b) => new Date(a.sendTime) - new Date(b.sendTime))[0];
        
        if (nextEmail) {
          const nextTime = new Date(nextEmail.sendTime);
          const timeUntil = getTimeUntilSend(nextTime.getTime());
          const exactTime = nextTime.toLocaleString();
          nextScheduledTimeEl.style.display = 'block';
          nextScheduledTextEl.innerHTML = `Next: ${timeUntil}<br><small>${exactTime}</small>`;
        } else {
          nextScheduledTimeEl.style.display = 'none';
        }
      } catch (error) {
        console.error('Error processing next scheduled email:', error);
        nextScheduledTimeEl.style.display = 'none';
      }
    } else if (nextScheduledTimeEl) {
      nextScheduledTimeEl.style.display = 'none';
    }
    clearAllScheduledBtn.style.display = scheduledEmails.length > 0 ? 'inline-flex' : 'none';
    
    if (scheduledEmails.length > 1 && scheduledSummaryEl && scheduledSummaryTextEl) {
      const upcomingEmails = scheduledEmails
        .filter(email => {
          const sendTime = new Date(email.sendTime);
          return sendTime > now;
        })
        .sort((a, b) => new Date(a.sendTime) - new Date(b.sendTime));
      
      if (upcomingEmails.length > 0) {
        const firstTime = new Date(upcomingEmails[0].sendTime);
        const lastTime = new Date(upcomingEmails[upcomingEmails.length - 1].sendTime);
        
        if (firstTime.toDateString() === lastTime.toDateString()) {
          scheduledSummaryTextEl.textContent = `Next: ${upcomingEmails.length} emails today`;
        } else {
          const days = Math.ceil((lastTime - firstTime) / (1000 * 60 * 60 * 24));
          scheduledSummaryTextEl.textContent = `Next: ${upcomingEmails.length} emails in ${days} days`;
        }
        scheduledSummaryEl.style.display = 'block';
      } else {
        scheduledSummaryEl.style.display = 'none';
      }
    } else if (scheduledSummaryEl) {
      scheduledSummaryEl.style.display = 'none';
    }
  }

  function getTimeUntilSend(sendTime) {
    try {
      const now = Date.now();
      const diff = sendTime - now;
      
      if (diff <= 0) return 'Sending now';
      
      const minutes = Math.floor(diff / (1000 * 60));
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      
      if (days > 0) {
        return `${days} day${days !== 1 ? 's' : ''}`;
      } else if (hours > 0) {
        return `${hours} hour${hours !== 1 ? 's' : ''}`;
      } else if (minutes > 0) {
        return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
      } else {
        return 'Sending soon';
      }
    } catch (error) {
      console.error('Error calculating time until send:', error);
      return 'Time error';
    }
  }

  function showStatus(message, type = 'info') {
    if (!statusEl) return;
    
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    
    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = 'status';
    }, 3000);
  }

  function loadSettings() {
    chrome.storage.sync.get({
      autoIntercept: true
    }, (items) => {
      if (autoInterceptCheckbox) autoInterceptCheckbox.checked = items.autoIntercept;
    });
  }

  function saveSettings() {
    chrome.storage.sync.set({
      autoIntercept: autoInterceptCheckbox?.checked ?? true
    });
  }
  
  autoInterceptCheckbox?.addEventListener('change', (e) => {
    saveSettings();
    chrome.tabs.query({ url: 'https://mail.google.com/*' }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { 
          action: 'settingsChanged', 
          autoIntercept: e.target.checked 
        }).catch(() => {});
      });
    });
  });

});
