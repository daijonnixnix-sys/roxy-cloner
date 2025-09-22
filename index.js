require('dotenv').config();
const { Client } = require('discord.js-selfbot-v13');
const https = require('https');

// Colors for console output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    reset: '\x1b[0m'
};

// Logging functions
const log = {
    success: (msg) => console.log(`${colors.green}[+] ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}[-] ${msg}${colors.reset}`),
    warning: (msg) => console.log(`${colors.yellow}[!] ${msg}${colors.reset}`),
    info: (msg) => console.log(`${colors.cyan}[i] ${msg}${colors.reset}`),
    header: (msg) => console.log(`${colors.magenta}${msg}${colors.reset}`)
};

// Utility functions
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function downloadImage(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const base64 = buffer.toString('base64');
                const mimeType = res.headers['content-type'] || 'image/png';
                resolve(`data:${mimeType};base64,${base64}`);
            });
            res.on('error', reject);
        }).on('error', reject);
    });
}

class ServerCloner {
    constructor(client) {
        this.client = client;
        this.roleMapping = new Map();
        this.stats = {
            rolesCreated: 0,
            categoriesCreated: 0,
            channelsCreated: 0,
            emojisCreated: 0,
            failed: 0
        };
    }

    async cloneServer(sourceGuildId, targetGuildId, cloneEmojis = true, progressChannel = null) {
        try {
            const sourceGuild = this.client.guilds.cache.get(sourceGuildId);
            const targetGuild = this.client.guilds.cache.get(targetGuildId);

            if (!sourceGuild) {
                throw new Error('Source server not found! Make sure you\'re a member.');
            }

            if (!targetGuild) {
                throw new Error('Target server not found! Make sure you\'re a member with admin permissions.');
            }

            this.sendProgress(`Cloning from: ${sourceGuild.name} -> ${targetGuild.name}`, progressChannel);
            this.sendProgress('Starting cloning process...', progressChannel);

            // Delete existing content
            await this.deleteExistingContent(targetGuild, progressChannel);

            // Clone in order
            await this.cloneRoles(sourceGuild, targetGuild, progressChannel);
            await this.cloneCategories(sourceGuild, targetGuild, progressChannel);
            await this.cloneChannels(sourceGuild, targetGuild, progressChannel);
            
            // Clone emojis if requested
            if (cloneEmojis) {
                await this.cloneEmojis(sourceGuild, targetGuild, progressChannel);
            }
            
            await this.cloneServerInfo(sourceGuild, targetGuild, progressChannel);

            // Show final stats
            this.showStats(progressChannel);
            this.sendProgress('🎉 Server cloning completed successfully!', progressChannel);

        } catch (error) {
            this.sendProgress(`❌ Cloning failed: ${error.message}`, progressChannel);
            throw error;
        }
    }

    async deleteExistingContent(guild, progressChannel) {
        this.sendProgress('🗑️  Deleting existing content...', progressChannel);
        
        // Delete channels first
        const channels = guild.channels.cache.filter(ch => ch.deletable);
        for (const [, channel] of channels) {
            try {
                await channel.delete();
                this.sendProgress(`Deleted channel: ${channel.name}`, progressChannel);
                await delay(100);
            } catch (error) {
                this.sendProgress(`Failed to delete channel ${channel.name}: ${error.message}`, progressChannel);
                this.stats.failed++;
            }
        }

        // Delete roles (except @everyone and managed roles)
        const roles = guild.roles.cache.filter(role => 
            role.name !== '@everyone' && 
            !role.managed && 
            role.editable
        );
        
        for (const [, role] of roles) {
            try {
                await role.delete();
                this.sendProgress(`Deleted role: ${role.name}`, progressChannel);
                await delay(100);
            } catch (error) {
                this.sendProgress(`Failed to delete role ${role.name}: ${error.message}`, progressChannel);
                this.stats.failed++;
            }
        }

        this.sendProgress('Cleanup completed.', progressChannel);
    }

    async cloneRoles(sourceGuild, targetGuild, progressChannel) {
        this.sendProgress('👑 Cloning roles...', progressChannel);
        
        const roles = sourceGuild.roles.cache
            .filter(role => role.name !== '@everyone')
            .sort((a, b) => a.position - b.position);

        for (const [, role] of roles) {
            try {
                const newRole = await targetGuild.roles.create({
                    name: role.name,
                    color: role.hexColor,
                    permissions: role.permissions,
                    hoist: role.hoist,
                    mentionable: role.mentionable,
                    reason: 'Server cloning'
                });

                this.roleMapping.set(role.id, newRole.id);
                this.sendProgress(`Created role: ${role.name}`, progressChannel);
                this.stats.rolesCreated++;
                await delay(200);

            } catch (error) {
                this.sendProgress(`Failed to create role ${role.name}: ${error.message}`, progressChannel);
                this.stats.failed++;
            }
        }

        // Fix role positions
        await this.fixRolePositions(sourceGuild, targetGuild, progressChannel);
        this.sendProgress('Roles cloning completed.', progressChannel);
    }

    async fixRolePositions(sourceGuild, targetGuild, progressChannel) {
        try {
            const sourceRoles = sourceGuild.roles.cache
                .filter(role => role.name !== '@everyone')
                .sort((a, b) => b.position - a.position);

            for (const [, sourceRole] of sourceRoles) {
                const targetRole = targetGuild.roles.cache.find(r => r.name === sourceRole.name);
                if (targetRole && targetRole.editable) {
                    try {
                        await targetRole.setPosition(sourceRole.position);
                        await delay(100);
                    } catch (error) {
                        // Position setting might fail, but continue
                    }
                }
            }
        } catch (error) {
            this.sendProgress('Could not fix all role positions', progressChannel);
        }
    }

    async cloneCategories(sourceGuild, targetGuild, progressChannel) {
        this.sendProgress('📁 Cloning categories...', progressChannel);
        
        const categories = sourceGuild.channels.cache
            .filter(ch => ch.type === 'GUILD_CATEGORY')
            .sort((a, b) => a.position - b.position);

        for (const [, category] of categories) {
            try {
                const overwrites = this.mapPermissionOverwrites(category.permissionOverwrites, targetGuild);
                
                const newCategory = await targetGuild.channels.create(category.name, {
                    type: 'GUILD_CATEGORY',
                    permissionOverwrites: overwrites || [],
                    position: category.position,
                    reason: 'Server cloning'
                });

                this.sendProgress(`Created category: ${category.name}`, progressChannel);
                this.stats.categoriesCreated++;
                await delay(200);

            } catch (error) {
                this.sendProgress(`Failed to create category ${category.name}: ${error.message}`, progressChannel);
                this.stats.failed++;
            }
        }

        this.sendProgress('Categories cloning completed.', progressChannel);
    }

    async cloneChannels(sourceGuild, targetGuild, progressChannel) {
        this.sendProgress('💬 Cloning channels...', progressChannel);
        
        const channels = sourceGuild.channels.cache
            .filter(ch => ch.type === 'GUILD_TEXT' || ch.type === 'GUILD_VOICE')
            .sort((a, b) => a.position - b.position);

        for (const [, channel] of channels) {
            try {
                const overwrites = this.mapPermissionOverwrites(channel.permissionOverwrites, targetGuild);
                const parent = channel.parent ? 
                    targetGuild.channels.cache.find(c => c.name === channel.parent.name && c.type === 'GUILD_CATEGORY') : 
                    null;

                const channelOptions = {
                    type: channel.type,
                    parent: parent?.id,
                    permissionOverwrites: overwrites || [],
                    position: channel.position,
                    reason: 'Server cloning'
                };

                // Channel-specific options
                if (channel.type === 'GUILD_TEXT') {
                    channelOptions.topic = channel.topic || '';
                    channelOptions.nsfw = channel.nsfw;
                    channelOptions.rateLimitPerUser = channel.rateLimitPerUser;
                } else if (channel.type === 'GUILD_VOICE') {
                    channelOptions.bitrate = channel.bitrate;
                    channelOptions.userLimit = channel.userLimit;
                }

                const newChannel = await targetGuild.channels.create(channel.name, channelOptions);
                
                const channelType = channel.type === 'GUILD_TEXT' ? 'text' : 'voice';
                this.sendProgress(`Created ${channelType} channel: ${channel.name}`, progressChannel);
                this.stats.channelsCreated++;
                await delay(200);

            } catch (error) {
                this.sendProgress(`Failed to create channel ${channel.name}: ${error.message}`, progressChannel);
                this.stats.failed++;
            }
        }

        this.sendProgress('Channels cloning completed.', progressChannel);
    }

    async cloneEmojis(sourceGuild, targetGuild, progressChannel) {
        this.sendProgress('😀 Cloning emojis...', progressChannel);
        
        const emojis = sourceGuild.emojis.cache;
        
        for (const [, emoji] of emojis) {
            try {
                const emojiURL = emoji.url;
                const imageData = await downloadImage(emojiURL);

                await targetGuild.emojis.create(imageData, emoji.name, {
                    reason: 'Server cloning'
                });

                this.sendProgress(`Created emoji: ${emoji.name}`, progressChannel);
                this.stats.emojisCreated++;
                // Wait 2 seconds between emoji uploads as requested
                await delay(2000);

            } catch (error) {
                this.sendProgress(`Failed to create emoji ${emoji.name}: ${error.message}`, progressChannel);
                this.stats.failed++;
            }
        }

        this.sendProgress('Emojis cloning completed.', progressChannel);
    }

    async cloneServerInfo(sourceGuild, targetGuild, progressChannel) {
        this.sendProgress('🏠 Cloning server info...', progressChannel);
        
        try {
            let iconData = null;
            
            if (sourceGuild.iconURL()) {
                try {
                    iconData = await downloadImage(sourceGuild.iconURL({ format: 'png', size: 1024 }));
                } catch (error) {
                    this.sendProgress('Could not download server icon', progressChannel);
                }
            }

            await targetGuild.setName(sourceGuild.name);
            this.sendProgress(`Updated server name: ${sourceGuild.name}`, progressChannel);

            if (iconData) {
                await targetGuild.setIcon(iconData);
                this.sendProgress('Updated server icon', progressChannel);
            }

        } catch (error) {
            this.sendProgress(`Failed to update server info: ${error.message}`, progressChannel);
            this.stats.failed++;
        }

        this.sendProgress('Server info cloning completed.', progressChannel);
    }

    mapPermissionOverwrites(overwrites, targetGuild) {
        const mappedOverwrites = [];

        if (!overwrites || !overwrites.cache) {
            return mappedOverwrites;
        }

        overwrites.cache.forEach((overwrite) => {
            try {
                let targetId = overwrite.id;

                // If it's a role overwrite, map to new role
                if (overwrite.type === 'role') {
                    const newRoleId = this.roleMapping.get(overwrite.id);
                    if (newRoleId) {
                        targetId = newRoleId;
                    } else {
                        // Try to find role by name in target guild
                        const targetRole = targetGuild.roles.cache.find(r => {
                            // Find corresponding source role
                            const sourceGuild = overwrites.constructor.name === 'PermissionOverwriteManager' ? overwrites.channel.guild : null;
                            if (sourceGuild) {
                                const sourceRole = sourceGuild.roles.cache.get(overwrite.id);
                                return sourceRole && r.name === sourceRole.name;
                            }
                            return false;
                        });
                        if (targetRole) {
                            targetId = targetRole.id;
                        } else {
                            // Skip this overwrite if we can't map the role
                            return;
                        }
                    }
                }

                // Validate that overwrite has required properties
                if (overwrite.allow !== undefined && overwrite.deny !== undefined) {
                    mappedOverwrites.push({
                        id: targetId,
                        type: overwrite.type,
                        allow: overwrite.allow,
                        deny: overwrite.deny
                    });
                }
            } catch (error) {
                // Skip this overwrite if there's an error
                this.sendProgress(`Skipped permission overwrite due to error: ${error.message}`);
            }
        });

        return mappedOverwrites;
    }

    showStats(progressChannel) {
        const total = this.stats.rolesCreated + this.stats.categoriesCreated + 
                     this.stats.channelsCreated + this.stats.emojisCreated;
        const successRate = Math.round((total/(total + this.stats.failed)) * 100) || 0;
        
        const statsMessage = `
📊 **Cloning Statistics:**
✅ Roles Created: ${this.stats.rolesCreated}
✅ Categories Created: ${this.stats.categoriesCreated}
✅ Channels Created: ${this.stats.channelsCreated}
✅ Emojis Created: ${this.stats.emojisCreated}
❌ Failed Operations: ${this.stats.failed}
📈 Success Rate: ${successRate}%`;
        
        this.sendProgress(statsMessage, progressChannel);
    }
    
    sendProgress(message, progressChannel) {
        // Send progress to Discord if progressChannel is provided
        if (progressChannel) {
            // Split message if it's too long
            if (message.length > 2000) {
                const chunks = message.match(/.{1,2000}/g);
                chunks.forEach(chunk => {
                    progressChannel.send(chunk).catch(() => {});
                });
            } else {
                progressChannel.send(message).catch(() => {});
            }
        }
        
        // Also log to console
        if (message.includes('❌') || message.includes('[-]')) {
            log.error(message.replace(/❌|✅|📊|📈|🗑️|👑|📁|💬|😀|🏠|🎉/g, '').trim());
        } else if (message.includes('✅') || message.includes('[+]')) {
            log.success(message.replace(/❌|✅|📊|📈|🗑️|👑|📁|💬|😀|🏠|🎉/g, '').trim());
        } else if (message.includes('📊') || message.includes('📈') || message.includes('[i]')) {
            log.info(message.replace(/❌|✅|📊|📈|🗑️|👑|📁|💬|😀|🏠|🎉/g, '').trim());
        } else {
            console.log(message);
        }
    }
}

// Store pending operations
const pendingOperations = new Map();

// Create client
const client = new Client();

// Handle command
client.on('messageCreate', async (message) => {
    // Ignore messages from bots or system messages
    if (message.author.bot) return;
    
    // Check if the message is a DM or in a guild
    const isDM = message.channel.type === 'DM';
    
    // Check if user is allowed
    const allowedUserIds = process.env.ALLOWED_USER_IDS?.split(',').map(id => id.trim()) || [];
    const isAllowedUser = allowedUserIds.includes(message.author.id);
    
    // Handle responses to pending operations
    if (pendingOperations.has(message.author.id)) {
        const operation = pendingOperations.get(message.author.id);
        
        // Only allowed users can respond to operations
        if (!isAllowedUser) {
            // Silently ignore non-allowed users
            return;
        }
        
        // Handle confirmation responses
        if (operation.step === 'confirmProceed') {
            const response = message.content.toLowerCase().trim();
            if (response === 'y' || response === 'yes') {
                // Ask about emoji cloning
                message.channel.send('❓ Do you want to clone emojis too? (y/n)').catch(() => {});
                operation.step = 'confirmEmojis';
                return;
            } else if (response === 'n' || response === 'no') {
                message.channel.send('❌ Operation cancelled.').catch(() => {});
                pendingOperations.delete(message.author.id);
                return;
            } else {
                message.channel.send('❌ Please respond with "y" or "n"').catch(() => {});
                return;
            }
        } else if (operation.step === 'confirmEmojis') {
            const response = message.content.toLowerCase().trim();
            if (response === 'y' || response === 'yes') {
                operation.cloneEmojis = true;
                pendingOperations.delete(message.author.id);
                // Start cloning
                message.channel.send('🚀 Starting server cloning process...').catch(() => {});
                try {
                    const cloner = new ServerCloner(client);
                    await cloner.cloneServer(operation.sourceGuildId, operation.targetGuildId, operation.cloneEmojis, message.channel);
                } catch (error) {
                    message.channel.send(`❌ Error during cloning: ${error.message}`).catch(() => {});
                }
                return;
            } else if (response === 'n' || response === 'no') {
                operation.cloneEmojis = false;
                pendingOperations.delete(message.author.id);
                // Start cloning without emojis
                message.channel.send('🚀 Starting server cloning process (without emojis)...').catch(() => {});
                try {
                    const cloner = new ServerCloner(client);
                    await cloner.cloneServer(operation.sourceGuildId, operation.targetGuildId, operation.cloneEmojis, message.channel);
                } catch (error) {
                    message.channel.send(`❌ Error during cloning: ${error.message}`).catch(() => {});
                }
                return;
            } else {
                message.channel.send('❌ Please respond with "y" or "n"').catch(() => {});
                return;
            }
        }
    }
    
    // Check if message starts with !clone
    if (message.content.startsWith('!clone')) {
        // Only allowed users can initiate clone operations
        if (!isAllowedUser) {
            // Silently ignore non-allowed users
            return;
        }
        
        // Parse command
        const args = message.content.slice(6).trim().split(/ +/);
        const sourceGuildId = args[0];
        const targetGuildId = args[1];
        
        // Validate arguments
        if (!sourceGuildId || !targetGuildId) {
            message.channel.send('❌ Usage: `!clone <source server ID> <target server ID>`').catch(() => {});
            return;
        }
        
        try {
            // Get guild names for confirmation
            const sourceGuild = client.guilds.cache.get(sourceGuildId);
            const targetGuild = client.guilds.cache.get(targetGuildId);
            
            if (!sourceGuild) {
                message.channel.send('❌ Source server not found! Make sure you\'re a member.').catch(() => {});
                return;
            }
            
            if (!targetGuild) {
                message.channel.send('❌ Target server not found! Make sure you\'re a member with admin permissions.').catch(() => {});
                return;
            }
            
            // Store operation and ask for confirmation
            pendingOperations.set(message.author.id, {
                step: 'confirmProceed',
                sourceGuildId,
                targetGuildId,
                sourceGuildName: sourceGuild.name,
                targetGuildName: targetGuild.name,
                cloneEmojis: true
            });
            
            message.channel.send(`📋 **Server Cloning Confirmation**
Source Server: **${sourceGuild.name}**
Target Server: **${targetGuild.name}**

Do you want to proceed? (y/n)`).catch(() => {});
        } catch (error) {
            message.channel.send(`❌ Error: ${error.message}`).catch(() => {});
        }
    }
});

// Handle process termination
process.on('SIGINT', () => {
    log.warning('\nProcess interrupted by user');
    process.exit(0);
});

process.on('unhandledRejection', (error) => {
    log.error(`Unhandled rejection: ${error.message}`);
});

process.on('uncaughtException', (error) => {
    log.error(`Uncaught exception: ${error.message}`);
});

// Login
client.login(process.env.TOKEN).then(() => {
    log.success('Logged in successfully!');
}).catch((error) => {
    log.error(`Login failed: ${error.message}`);
    process.exit(1);
});

// Export the ServerCloner class for external use
module.exports = { ServerCloner };
