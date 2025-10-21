const GMAIL_SEND_URL = 'https://www.googleapis.com/gmail/v1/users/me/messages/send';
const GMAIL_DRAFTS_URL = 'https://www.googleapis.com/gmail/v1/users/me/drafts';


let scheduledEmails = [];

let currentSettings = { autoIntercept: true };

chrome.storage.local.get(['scheduledEmails'], (result) => {
  scheduledEmails = result.scheduledEmails || [];
  
  cleanupOverdueEmails();
  
  startScheduler();
  
  console.log(`SendIQ: Extension started with ${scheduledEmails.length} scheduled emails`);
});

chrome.storage.sync.get({ autoIntercept: true }, (items) => {
  currentSettings = items;
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.autoIntercept) {
    currentSettings.autoIntercept = changes.autoIntercept.newValue;
    console.log(`SendIQ: Background script updated autoIntercept to ${currentSettings.autoIntercept}`);
  }
});


function cleanupOverdueEmails() {
  const now = Date.now();
  const stuckEmails = scheduledEmails.filter(email => {
    return email.sendTime < (now - 3600000);
  });
  
  if (stuckEmails.length > 0) {
    console.log(`SendIQ: Cleaning up ${stuckEmails.length} stuck overdue emails`);
    
    scheduledEmails = scheduledEmails.filter(email => !stuckEmails.includes(email));    

    chrome.storage.local.set({ scheduledEmails });
    

    chrome.runtime.sendMessage({ 
      action: 'scheduledEmailsChanged', 
      scheduledEmails 
    }).catch(() => {});
  }
}


function startScheduler() {
  setInterval(() => {
    try {
      checkScheduledEmails();
    } catch (error) {
      console.error('SendIQ: Error in scheduler:', error);
    }
  }, 30000);

  setInterval(() => {
    try {
      cleanupOverdueEmails();
    } catch (error) {
      console.error('SendIQ: Error in cleanup:', error);
    }
  }, 300000);
}


async function checkScheduledEmails() {
  const now = Date.now();
  

  const emailsToSend = scheduledEmails.filter(email => {

    return email.sendTime <= (now + 59999);
  });
  
  if (emailsToSend.length === 0) return;
  
  console.log(`SendIQ: Found ${emailsToSend.length} scheduled emails to send`);
  
  for (const email of emailsToSend) {
    try {

      if (email.sendTime > now) {
        console.log(`SendIQ: Email ${email.id} not ready yet, skipping`);
        continue;
      }
      
      await sendScheduledEmail(email);

      scheduledEmails = scheduledEmails.filter(e => e.id !== email.id);
    } catch (error) {
      console.error('SendIQ: Failed to send scheduled email:', error);

      email.failed = true;
      email.error = error.message;
    }
  }
  

  chrome.storage.local.set({ scheduledEmails });
  

  chrome.runtime.sendMessage({ 
    action: 'scheduledEmailsChanged', 
    scheduledEmails 
  }).catch(() => {});
}


async function sendScheduledEmail(email) {
  const token = await getAuthTokenInteractive();
  

  const whoami = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { 'Authorization': 'Bearer ' + token }
  }).then(r => r.json()).catch(() => ({}));

  const fromEmail = whoami.email || 'me';
  const fromName = whoami.name || '';


  for (const recipient of email.recipients) {
    try {
      const raw = buildRawMessage({
        to: recipient.email,
        fromEmail,
        fromName,
        subject: email.subject,
        bodyHtml: recipient.bodyHtml
      });
      
      await sendOneMessage(raw, token);
      console.log(`SendIQ: Sent scheduled email to ${recipient.email}`);
    } catch (error) {
      console.error(`SendIQ: Failed to send scheduled email to ${recipient.email}:`, error);
      throw error;
    }
  }
  
  console.log(`SendIQ: Successfully sent scheduled email "${email.subject}" to ${email.recipients.length} recipients`);
}


function base64UrlEncode(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}


function buildRawMessage({to, fromName, fromEmail, subject, bodyHtml}) {
  const raw =
    `From: ${fromName ? `"${fromName}" ` : ''}<${fromEmail}>\r\n` +
    `To: <${to}>\r\n` +
    `Subject: ${subject}\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: text/html; charset=UTF-8\r\n\r\n` +
    `${bodyHtml}`;

  return base64UrlEncode(raw);
}


async function sendOneMessage(rawMessage, authToken) {
  const res = await fetch(GMAIL_SEND_URL + '?uploadType=multipart', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + authToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw: rawMessage })
  });

  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json;
}


async function deleteDraft(draftId, authToken) {
  try {
    const res = await fetch(`${GMAIL_DRAFTS_URL}/${draftId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': 'Bearer ' + authToken
      }
    });
    
    if (!res.ok) {
      const json = await res.json();
      throw new Error(JSON.stringify(json));
    }
    
    console.log(`SendIQ: Successfully deleted draft ${draftId}`);
    return true;
  } catch (error) {
    console.error(`SendIQ: Failed to delete draft ${draftId}:`, error);
    throw error;
  }
}


async function deleteMostRecentDraft(authToken) {
  try {
    const res = await fetch(GMAIL_DRAFTS_URL, {
      headers: {
        'Authorization': 'Bearer ' + authToken
      }
    });
    
    if (!res.ok) {
      const json = await res.json();
      throw new Error(JSON.stringify(json));
    }
    
    const drafts = await res.json();
    
    if (!drafts.drafts || drafts.drafts.length === 0) {
      console.log('SendIQ: No drafts found to delete');
      return false;
    }
    

    const mostRecentDraft = drafts.drafts[0];
    console.log(`SendIQ: Found most recent draft: ${mostRecentDraft.id}`);
    
    
    await deleteDraft(mostRecentDraft.id, authToken);
    return true;
  } catch (error) {
    console.error('SendIQ: Failed to delete most recent draft:', error);
    throw error;
  }
}


async function deleteDraftByContent(authToken, subject, content) {
  try {
    console.log(`SendIQ: Searching for draft with subject: "${subject}" and content starting with: "${content}"`);
    
    
    const res = await fetch(GMAIL_DRAFTS_URL, {
      headers: {
        'Authorization': 'Bearer ' + authToken
      }
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      console.log(`SendIQ: Gmail API error response: ${res.status} ${res.statusText}`);
      console.log(`SendIQ: Error details: ${errorText}`);
      
      
      if (res.status === 401) {
        console.log('SendIQ: Auth error, token may be expired');
        throw new Error('Authentication failed - token may be expired');
      }
      
      throw new Error(`Gmail API error: ${res.status} ${res.statusText}`);
    }
    
    const drafts = await res.json();
    
    if (!drafts.drafts || drafts.drafts.length === 0) {
      console.log('SendIQ: No drafts found to delete');
      return false;
    }
    
    console.log(`SendIQ: Found ${drafts.drafts.length} drafts, searching for matches...`);
    
    
    for (const draft of drafts.drafts) {
      try {
        console.log(`SendIQ: Checking draft ${draft.id}...`);
        
        
        const draftRes = await fetch(`${GMAIL_DRAFTS_URL}/${draft.id}`, {
          headers: {
            'Authorization': 'Bearer ' + authToken
          }
        });
        
        if (draftRes.ok) {
          const draftData = await draftRes.json();
          const draftMessage = draftData.message;
          
          if (draftMessage) {
            
            const draftSubject = draftMessage.payload?.headers?.find(h => 
              h.name && h.name.toLowerCase() === 'subject'
            )?.value || '';
            
            const subjectMatch = draftSubject.toLowerCase() === subject.toLowerCase();
            console.log(`SendIQ: Draft ${draft.id} - Subject: "${draftSubject}", Subject match: ${subjectMatch}`);
            
            if (subjectMatch) {
              let draftContent = null;
              let contentSource = 'unknown';
              
              
              if (draftMessage.payload?.body?.data) {
                draftContent = draftMessage.payload.body.data;
                contentSource = 'main body';
              }
              
              else if (draftMessage.payload?.parts) {
                const htmlPart = draftMessage.payload.parts.find(p => 
                  p.mimeType === 'text/html' && p.body?.data
                );
                if (htmlPart) {
                  draftContent = htmlPart.body.data;
                  contentSource = 'HTML part';
                }
              }
              
              else if (draftMessage.payload?.parts) {
                const textPart = draftMessage.payload.parts.find(p => 
                  p.mimeType === 'text/plain' && p.body?.data
                );
                if (textPart) {
                  draftContent = textPart.body.data;
                  contentSource = 'text part';
                }
              }
              
              console.log(`SendIQ: Draft ${draft.id} - Content source: ${contentSource}, Has content: ${!!draftContent}`);
              
              if (draftContent) {
                try {
                  
                  let decodedContent;
                  try {
                    decodedContent = atob(draftContent.replace(/-/g, '+').replace(/_/g, '/'));
                  } catch (e) {
                    decodedContent = atob(draftContent);
                  }
                  
                  const cleanDecodedContent = decodedContent
                    .replace(/<[^>]*>/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                  
                  const cleanSearchContent = content
                    .replace(/<[^>]*>/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                  

                  const contentMatch = cleanDecodedContent.includes(cleanSearchContent.substring(0, 100));
                  console.log(`SendIQ: Draft ${draft.id} - Content match: ${contentMatch}`);
                  console.log(`SendIQ: Draft ${draft.id} - Clean content preview: "${cleanDecodedContent.substring(0, 150)}..."`);
                  
                  if (contentMatch) {
                    console.log(`SendIQ: Found matching draft: ${draft.id}, deleting...`);
                    await deleteDraft(draft.id, authToken);
                    return true;
                  }
                } catch (decodeError) {
                  console.log(`SendIQ: Could not decode draft content for draft ${draft.id}:`, decodeError);
                  console.log(`SendIQ: Raw content data: ${draftContent.substring(0, 100)}...`);
                }
              } else {
                console.log(`SendIQ: Draft ${draft.id} - No content found in any expected location`);
              }
            }
          } else {
            console.log(`SendIQ: Draft ${draft.id} - No message payload found`);
          }
        } else {
          console.log(`SendIQ: Could not fetch draft ${draft.id}: ${draftRes.status} ${draftRes.statusText}`);
        }
      } catch (draftError) {
        console.log(`SendIQ: Could not check draft ${draft.id}:`, draftError);
        continue;
      }
    }
    
    console.log('SendIQ: No matching draft found, falling back to most recent');

    return await deleteMostRecentDraft(authToken);
  } catch (error) {
    console.error('SendIQ: Failed to delete draft by content:', error);
    throw error;
  }
}


async function getAuthTokenInteractive() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: false }, (cachedToken) => {
      if (chrome.runtime.lastError || !cachedToken) {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
          if (chrome.runtime.lastError || !token) reject(new Error(chrome.runtime.lastError?.message || 'No token'));
          else resolve(token);
        });
      } else {
        chrome.identity.removeCachedAuthToken({ token: cachedToken }, () => {
          chrome.identity.getAuthToken({ interactive: true }, (token) => {
            if (chrome.runtime.lastError || !token) reject(new Error(chrome.runtime.lastError?.message || 'No token'));
            else resolve(token);
          });
        });
      }
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'sendEmails') {
    let responseSent = false;
    
    if (!currentSettings.autoIntercept) {
      console.log('SendIQ: Auto-intercept is disabled, skipping mass send');
      sendResponse({ ok: false, message: 'Auto-intercept is disabled' });
      return true;
    }
    

    sendResponse({ ok: true, message: 'Mass send started in background' });
    responseSent = true;
    

    (async () => {
        try {
          console.log(`SendIQ: Starting mass send for ${msg.recipients.length} recipients in background`);
        
        const token = await getAuthTokenInteractive();


        const whoami = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { 'Authorization': 'Bearer ' + token }
        }).then(r => r.json()).catch(() => ({}));

        const fromEmail = whoami.email || 'me';
        const fromName = whoami.name || '';

        const results = [];
        const delayMs = Math.max(0, Math.min(5000, Number(msg.delayMs || 5)));
        
        for (let i = 0; i < msg.recipients.length; i++) {
          const r = msg.recipients[i];
          try {
            const raw = buildRawMessage({
              to: r.email,
              fromEmail,
              fromName,
              subject: msg.subject,
              bodyHtml: r.bodyHtml
            });
            const res = await sendOneMessage(raw, token);
            results.push({ email: r.email, success: true, id: res.id });
            console.log(`SendIQ: Sent email ${i + 1}/${msg.recipients.length} to ${r.email}`);

            if (i < msg.recipients.length - 1 && delayMs > 0) {
              await new Promise(res => setTimeout(res, delayMs));
            }
          } catch (err) {
            console.error('SendIQ: Send error for', r.email, err);
            results.push({ email: r.email, success: false, error: (err.message || String(err)) });

            if (err.message && err.message.includes('Invalid Credentials')) {
              chrome.identity.removeCachedAuthToken({ token }, () => {});
            }
          }
        }

        try {
          chrome.storage.local.get(['recentActivity'], (result) => {
            const activities = result.recentActivity || [];
            activities.unshift({
              subject: msg.subject,
              recipientCount: msg.recipients.length,
              success: true,
              timestamp: Date.now()
            });

            if (activities.length > 10) {
              activities.splice(10);
            }
            
            chrome.storage.local.set({ recentActivity: activities });
          });
        } catch (e) {
        }
        

        chrome.runtime.sendMessage({ 
          action: 'massSendCompleted', 
          results: results,
          totalRecipients: msg.recipients.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length
        }).catch(() => {});
        
        console.log(`SendIQ: Mass send completed - ${results.filter(r => r.success).length}/${msg.recipients.length} successful`);
        
      } catch (err) {
        console.error('SendIQ: Failed to send emails:', err);
        

        try {
          chrome.storage.local.get(['recentActivity'], (result) => {
            const activities = result.recentActivity || [];
            activities.unshift({
              subject: msg.subject,
              recipientCount: msg.recipients.length,
              success: false,
              timestamp: Date.now()
            });
            
            if (activities.length > 10) {
              activities.splice(10);
            }
            
            chrome.storage.local.set({ recentActivity: activities });
          });
        } catch (e) {
        }
        

        chrome.runtime.sendMessage({ 
          action: 'massSendError', 
          error: err.message || String(err)
        }).catch(() => {});
      }
    })();

    return true;
  }
  
  if (msg.action === 'scheduleEmail') {
    let responseSent = false;
    
    (async () => {
      try {
        const scheduledEmail = {
          id: `scheduled-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          recipients: msg.recipients,
          subject: msg.subject,
          sendTime: msg.sendTime,
          scheduledAt: Date.now(),
          dialogId: msg.dialogId
        };
        
        scheduledEmails.push(scheduledEmail);

        chrome.storage.local.set({ scheduledEmails });
        
        console.log(`SendIQ: Scheduled email "${msg.subject}" for ${msg.recipients.length} recipients at ${new Date(msg.sendTime).toLocaleString()}`);
       
        chrome.runtime.sendMessage({ 
          action: 'scheduledEmailsChanged', 
          scheduledEmails 
        }).catch(() => {});
        
        if (!responseSent) {
          sendResponse({ ok: true, scheduledId: scheduledEmail.id });
          responseSent = true;
        }
      } catch (err) {
        console.error('SendIQ: Failed to schedule email:', err);
        if (!responseSent) {
          sendResponse({ ok: false, error: err.message || String(err) });
          responseSent = true;
        }
      }
    })();
    
    return true;
  }
  
  if (msg.action === 'requestAuth') {
    (async () => {
      try {
        const token = await getAuthTokenInteractive();
        const whoami = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { 'Authorization': 'Bearer ' + token }
        }).then(r => r.json()).catch(() => ({}));
        sendResponse({ ok: true, email: whoami.email || null, name: whoami.name || null });
      } catch (err) {
        sendResponse({ ok: false, error: err.message || String(err) });
      }
    })();
    return true;
  }
  if (msg.action === 'autoAuth') {
    (async () => {
      try {
        const token = await new Promise((resolve, reject) => {
          chrome.identity.getAuthToken({ interactive: false }, (t) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else if (!t) reject(new Error('No token'));
            else resolve(t);
          });
        });
        const whoami = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { 'Authorization': 'Bearer ' + token }
        }).then(r => r.json()).catch(() => ({}));
        sendResponse({ ok: true, email: whoami.email || null, name: whoami.name || null });
      } catch (err) {
        sendResponse({ ok: false, error: err.message || String(err) });
      }
    })();
    return true;
  }
  
  if (msg.action === 'authorize') {
    (async () => {
      try {
        const token = await getAuthTokenInteractive();
        const whoami = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { 'Authorization': 'Bearer ' + token }
        }).then(r => r.json()).catch(() => ({}));
        sendResponse({ ok: true, email: whoami.email || null, name: whoami.name || null });
      } catch (err) {
        sendResponse({ ok: false, error: err.message || String(err) });
      }
    })();
    return true;
  }
  
  if (msg.action === 'deleteDraft') {
    (async () => {
      try {
        const token = await getAuthTokenInteractive();
        const deleted = await deleteMostRecentDraft(token);
        sendResponse({ ok: true, deleted });
      } catch (err) {
        console.error('SendIQ: Failed to delete draft:', err);
        sendResponse({ ok: false, error: err.message || String(err) });
      }
    })();
    return true;
  }
  
  if (msg.action === 'deleteDraftByContent') {
    (async () => {
      try {
        console.log(`SendIQ: deleteDraftByContent called with subject: "${msg.subject}" and content: "${msg.content}"`);
        
        if (!msg.subject && !msg.content) {
          console.log('SendIQ: No subject or content provided, falling back to deleteMostRecentDraft');
          const token = await getAuthTokenInteractive();
          const deleted = await deleteMostRecentDraft(token);
          sendResponse({ ok: true, deleted, method: 'fallback' });
          return;
        }
        
        const token = await getAuthTokenInteractive();
        const deleted = await deleteDraftByContent(token, msg.subject || '', msg.content || '');
        sendResponse({ ok: true, deleted, method: 'content_match' });
      } catch (err) {
        console.error('SendIQ: Failed to delete draft by content:', err);
        
        let errorMessage = err.message || String(err);
        let errorType = 'unknown';
        
        if (err.message?.includes('Authentication failed')) {
          errorType = 'auth_error';
          errorMessage = 'Authentication failed - please refresh the page and try again';
        } else if (err.message?.includes('Gmail API error: 403')) {
          errorType = 'permission_error';
          errorMessage = 'Permission denied - Gmail API access may be restricted';
        } else if (err.message?.includes('Gmail API error: 429')) {
          errorType = 'rate_limit_error';
          errorMessage = 'Rate limit exceeded - please wait a moment and try again';
        } else if (err.message?.includes('Gmail API error: 500')) {
          errorType = 'server_error';
          errorMessage = 'Gmail server error - please try again later';
        }
        
        sendResponse({ 
          ok: false, 
          error: errorMessage, 
          errorType: errorType,
          details: err.message || String(err)
        });
      }
    })();
    return true;
  }
  if (msg.action === 'getAccount') {
    (async () => {
      try {
        const token = await new Promise((resolve, reject) => {
          chrome.identity.getAuthToken({ interactive: false }, (t) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else if (!t) reject(new Error('No token'));
            else resolve(t);
          });
        });
        const whoami = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { 'Authorization': 'Bearer ' + token }
        }).then(r => r.json()).catch(() => ({}));
        sendResponse({ ok: true, email: whoami.email || null, name: whoami.name || null, picture: whoami.picture || null });
      } catch (err) {
        sendResponse({ ok: false, error: err.message || String(err) });
      }
    })();
    return true;
  }
});
