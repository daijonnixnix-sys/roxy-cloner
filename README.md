<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=24&duration=3000&pause=500&color=ff0000&center=true&vCenter=true&width=440&lines=Roxy+Server+Cloner;Built+in+node.js+%F0%9F%94%A5;By+it's+Manish" alt="Typing SVG" />
</p>

<p align="center">
  <!-- Discord Selfbot badge -->
  <a href="https://discord.com/" target="_blank">
    <img src="https://img.shields.io/badge/join-Discord-blue?style=for-the-badge&logo=discord" alt="Join Discord">
  </a>
</p>

<p align="center">
  <img src="https://imgs.search.brave.com/g5M_0-83yqep0LSVR1sg3Nk2uviNl5tcqHXmv-NPlew/rs:fit:500:0:1:0/g:ce/aHR0cHM6Ly9pLnBp/bmltZy5jb20vb3Jp/Z2luYWxzLzA2LzQw/LzZjLzA2NDA2Yzk0/OWFjYjkzODk0MjRm/ZjhmMjUyZjQ5ODkz/LmpwZw" alt="Server Cloning" width="300">
</p>

##  Features

- Clone entire Discord servers with one command
- Optional emoji cloning with rate limiting
- Progress tracking in Discord chat
- GitHub Actions integration

##  Setup

1. **Fork this repository**
2. **Add your secrets in repository settings:**
   - `DISCORD_TOKEN` - Your Discord user token
   - `ALLOWED_USER_IDS` - Comma-separated list of allowed user IDs

## 🎯 Usage

### Discord Command
```
!clone <source server ID> <target server ID>
```

The bot will then ask for confirmation:
1. Confirm server details (y/n)
2. Choose whether to clone emojis (y/n)

### GitHub Actions
1. Go to the **Actions** tab
2. Select **Discord Server Cloner**
3. Click **Run workflow**
## ⚙️ Environment Variables if you want to run on your pc

Create a `.env` file with:

```env
TOKEN=your_discord_user_token_here
ALLOWED_USER_IDS=user_id1,user_id2,user_id3
```
## ⚠️ Disclaimer

This tool is for educational purposes only. Use responsibly and ensure you have permission to clone servers.


<p align="center">
  ⚠️ If you are using this project or it's code anywhere, please give proper credit to <strong>it's Manish</strong>.<br>
  Do not redistribute or sell this project without permission.<br>
  <em>Respect the original author!</em>
</p>
