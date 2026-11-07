import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { Admin, Domain, Post } from './models.js';
import { ensureCornerstoneArticles } from './utils/cornerstoneArticles.js';

await mongoose.connect(process.env.MONGO_URI);
const email = process.env.ADMIN_EMAIL, password = process.env.ADMIN_PASSWORD;
await Admin.updateOne({ email: email.toLowerCase() }, { password: await bcrypt.hash(password, 12) }, { upsert: true });
if (process.env.DEFAULT_DOMAIN) await Domain.updateOne({ name: process.env.DEFAULT_DOMAIN.toLowerCase() }, {}, { upsert: true });

// Seed two draft blog posts
await Post.updateOne(
  { slug: 'what-is-a-temporary-email' },
  {
    title: 'What is a temporary email',
    slug: 'what-is-a-temporary-email',
    body: 'A temporary email (also known as disposable email, temp mail, or throwaway email) is a service that allows you to receive email at a temporary address that expires after a certain period of time. It protects your primary inbox from spam, unwanted advertising, data breaches, and tracking.',
    metaDescription: 'Learn what a temporary disposable email is and why you should use it to protect your privacy and reduce spam.',
    published: true,
  },
  { upsert: true }
);

await Post.updateOne(
  { slug: 'how-to-avoid-spam' },
  {
    title: 'How to avoid spam',
    slug: 'how-to-avoid-spam',
    body: 'Spam fills inboxes with junk and phishing risks. To avoid spam: 1) Never publish your personal email publicly. 2) Use disposable email services when registering for trials or newsletters. 3) Block suspicious senders. 4) Unsubscribe from marketing emails safely.',
    metaDescription: 'Effective tips and techniques to keep your personal inbox clean and avoid spam emails.',
    published: true,
  },
  { upsert: true }
);

await ensureCornerstoneArticles();

console.log(`Admin ready: ${email}`);
process.exit(0);
