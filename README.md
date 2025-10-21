# SendIQ (Mail Merge)

Send the same email to many recipients quickly — each recipient gets an individual message (no BCC).

## Features

### 🚀 Mass Email Sending
- **Automatic Detection**: Automatically detects when you're sending to multiple recipients
- **Individual Emails**: Each recipient gets their own email (no BCC)
- **Smart Personalization**: Use `{{name}}` in your emails for personalized messages
- **Rate Limiting**: Built-in delays to respect Gmail's sending limits
- **Seamless Integration**: Works with Gmail's native interface

### ⏰ Schedule Sending
- **Clock Icon**: Clean clock icon appears to the right of the Send button in Gmail composer
- **Flexible Scheduling**: Schedule for specific date/time or set delay
- **Quick Options**: Pre-configured delays (15 min, 30 min, 1 hour, tomorrow)
- **Background Processing**: Emails are sent automatically at the scheduled time
- **Modern Popup**: Clean, intuitive scheduling interface with smooth animations

### ⚙️ Smart Settings
- **Auto-Intercept**: Automatically detect multiple recipients
- **Notifications**: Show progress and results when sending emails
- **Schedule Control**: Enable/disable schedule sending functionality
- **Default Preferences**: Set your preferred scheduling options

## How It Works

### Mass Email Feature
1. Compose an email in Gmail
2. Add multiple recipients to the "To" field
3. The extension automatically intercepts the send button
4. Each recipient receives an individual email
5. Progress notifications show sending status

### Schedule Sending Feature
1. Compose an email in Gmail
2. Click the clock icon (⏰) that appears to the right of the Send button
3. Choose schedule type:
   - **Date & Time**: Pick specific date and time
   - **Delay**: Set hours and minutes from now
4. Use quick options for common delays (15 min, 30 min, 1 hour, tomorrow)
5. Click "Schedule Email" to confirm
6. Email is scheduled and sent automatically at the specified time

### Both Features Together
- **Mass emails** and **scheduled emails** work independently
- You can schedule mass emails (multiple recipients)
- Each scheduled email respects Gmail's sending limits
- Both features use the same personalization system

## Permissions

- **Gmail API**: Send emails on your behalf
- **Storage**: Save settings and scheduled emails
- **Identity**: OAuth authentication with Google
- **Scripting**: Inject functionality into Gmail

## Usage Tips

- Use `{{name}}` in your email body for personalization
- Schedule emails during off-hours for better delivery
- Look for the clock icon (⏰) next to the Send button in Gmail composer
- Use quick delay options for common scenarios (15 min, 30 min, 1 hour, tomorrow)
- Both features work independently - you can schedule mass emails too

## Technical Details

- **Background Service**: Handles email scheduling and sending
- **Content Script**: Integrates with Gmail's compose interface
- **Storage**: Chrome storage for settings and scheduled emails
- **OAuth2**: Secure authentication with Google services
- **Rate Limiting**: Respects Gmail's sending limits

## Key Features

### ✨ **Mass Email Sending**
- Automatically detects multiple recipients
- Sends individual emails (no BCC)
- Smart personalization with `{{name}}` placeholders
- Built-in rate limiting for Gmail compliance

### ⏰ **Schedule Send**
- **Clock Icon**: Clean, modern clock icon in Gmail composer
- **Smart Positioning**: Appears to the right of the Send button
- **Flexible Options**: Date/time picker or delay-based scheduling
- **Quick Presets**: 15 min, 30 min, 1 hour, tomorrow
- **Modern UI**: Smooth animations and professional design

### 🔧 **Smart Integration**
- Works seamlessly with Gmail's native interface
- No configuration required
- Automatic recipient detection
- Background processing for scheduled emails
- **Automatic Draft Cleanup**: Automatically deletes drafts after sending to prevent clutter
