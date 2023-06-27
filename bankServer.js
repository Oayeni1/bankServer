const express = require('express');
const { z } = require('zod');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

// MongoDB connection URI
const uri ='mongodb://127.0.0.1:27017/bankDb';

 mongoose.connect(uri, { useNewUrlParser: true });

// Define Mongoose schemas
const balanceSchema = new mongoose.Schema({
  accountNumber: {
    type: Number,
    unique: true,
    required: true,
  },
  balance: {
    type: Number,
    required: true,
  },
  createdAt: {
    type: Date,
    required: true,
  },
});

//transaction table
const transactionSchema = new mongoose.Schema({
  reference: {
    type: String,
    unique: true,
    required: true,
  },
  senderAccount: {
    type: Number,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  receiverAccount: {
    type: Number,
    required: true,
  },
  transferDescription: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    required: true,
  },
});

// Create Mongoose models
const Balance = mongoose.model('Balance', balanceSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);



// Zod schema for input validation
const transferSchema = z.object({
  from: z.number().positive(),
  to: z.number().positive(),
  amount: z.number().positive(),
});

// Endpoint to create an account stored in the balances collection
app.post('/create_account', async (req, res) => {

  const { accountNumber } = req.body;

  try {
    // Check if the account number already exists
    const existingAccount = await Balance.findOne({ accountNumber });
    if (existingAccount) {
      return res.status(400).json({ error: 'Account already exists' });
    }

    // Create a new account with zero balance
    const newAccount = new Balance({
      accountNumber: Math.floor((Math.random() * 10000000000) + 2),
      balance: req.body.balance,
      createdAt: new Date(),
    });
    await newAccount.save();

    res.status(201).json({ message: 'Account created successfully', account: newAccount });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Endpoint to get the balance for a particular account number
app.get('/balance/:accountNumber', async (req, res) => {
  const { accountNumber } = req.params;

  try {
    // Find the account in the balances collection
    const account = await Balance.findOne({ accountNumber: parseInt(accountNumber) });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ balance: account.balance });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

// Endpoint to get all accounts and their balances
app.get('/balance', async (req, res) => {
  try {
    // Fetch all accounts from the balances collection
    const accounts = await Balance.find();

    res.json({ balances: accounts });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get balances' });
  }
});

// Endpoint to make a transaction to another account
app.post('/transfer', async (req, res) => {
  try {
    const { from, to, amount } = transferSchema.parse(req.body);

    // Start a MongoDB session
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Check if the sender has sufficient funds
      const senderBalance = await Balance.findOne({ accountNumber: from }).session(session);
      if (!senderBalance || senderBalance.balance < amount) {
        throw new Error('Insufficient funds');
      }

      // Update the sender's balance
      await Balance.updateOne(
        { accountNumber: from },
        { $inc: { balance: -amount } },
        { session }
      );

      // Update the receiver's balance or create a new account
      await Balance.findOneAndUpdate(
        { accountNumber: to },
        { $inc: { balance: amount } },
        { upsert: true, session }
      );

      // Register the transaction
      const transaction = new Transaction({
        reference: generateTransactionReference(),
        senderAccount: from,
        amount,
        receiverAccount: to,
        transferDescription: 'Transfer',
        createdAt: new Date(),
      });
      await transaction.save({ session });

      // Commit the transaction
      await session.commitTransaction();
      session.endSession();

      res.json({ message: 'Transfer successful', transaction });
    } catch (error) {
      // Abort the transaction
      await session.abortTransaction();
      session.endSession();

      throw error;
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Helper function to generate a unique transaction reference
function generateTransactionReference() {
  return Math.random().toString(36).substring(2, 9).toUpperCase();
}


  app.listen(3000, () => {
    console.log(`Server is running on port ${3000}`);
  });
