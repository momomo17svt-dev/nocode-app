require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ url: process.env.DATABASE_URL });
prisma.$connect().then(()=>console.log('CONNECTED')).catch(e=>console.log(e));
