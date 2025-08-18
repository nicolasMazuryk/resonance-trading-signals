#!/usr/bin/env ts-node

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
};

async function generateSession(): Promise<void> {
  try {
    console.log('🔐 Telegram Session Generator');
    console.log('============================\n');

    const apiId = await question('Enter your Telegram API ID: ');
    const apiHash = await question('Enter your Telegram API Hash: ');
    const phoneNumber = await question('Enter your phone number (with country code, e.g., +1234567890): ');

    console.log('\nInitializing Telegram client...');

    const client = new TelegramClient(
      new StringSession(''),
      parseInt(apiId),
      apiHash,
      {
        connectionRetries: 5,
        useWSS: false,
      }
    );

    await client.start({
      phoneNumber: async () => phoneNumber,
      password: async () => {
        const password = await question('Enter your 2FA password (if enabled): ');
        return password;
      },
      phoneCode: async () => {
        const code = await question('Enter the verification code sent to your phone: ');
        return code;
      },
      onError: (err) => {
        console.error('❌ Error:', err);
      },
    });

    const sessionString = client.session.save();
    
    console.log('\n✅ Session generated successfully!');
    console.log('============================');
    console.log('Session String:');
    console.log(sessionString);
    console.log('\n📝 Add this to your .env file as:');
    console.log(`TELEGRAM_SESSION=${sessionString}`);
    console.log('\n⚠️  Keep this session string secure and private!');

    await client.disconnect();
    rl.close();

  } catch (error) {
    console.error('❌ Failed to generate session:', error);
    rl.close();
    process.exit(1);
  }
}

// Run the session generator
generateSession().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
