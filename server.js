require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const Web3 = require('web3');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Web3
const web3 = new Web3(process.env.ETHEREUM_NODE_URL || 'http://localhost:8545');

// Email transporter configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

// NBP API endpoints
const NBP_API_BASE = 'http://api.nbp.pl/api';

// Country-specific transfer fees (in percentage)
const TRANSFER_FEES = {
    PL: 0.5,  // Poland
    ZW: 1.0,  // Zimbabwe
    ZA: 0.8,  // South Africa
    NG: 0.9,  // Nigeria
    KE: 0.7,  // Kenya
    EG: 0.8,  // Egypt
    MA: 0.7,  // Morocco
    US: 0.5,  // United States
    GB: 0.6,  // United Kingdom
    DE: 0.5,  // Germany
    FR: 0.5,  // France
    IT: 0.6,  // Italy
    ES: 0.6,  // Spain
    CN: 0.7,  // China
    JP: 0.6,  // Japan
    IN: 0.7,  // India
    BR: 0.8,  // Brazil
    AU: 0.6,  // Australia
    CA: 0.5   // Canada
};

// Fetch exchange rates from NBP API
app.get('/api/exchange-rates', async (req, res) => {
    try {
        const response = await axios.get('https://api.nbp.pl/api/exchangerates/tables/A/');
        const rates = response.data[0].rates;
        
        // Convert NBP rates to our format
        const formattedRates = {
            USD: rates.find(r => r.code === 'USD')?.mid || 3.8774,
            EUR: rates.find(r => r.code === 'EUR')?.mid || 4.1979,
            GBP: rates.find(r => r.code === 'GBP')?.mid || 5.0148,
            CHF: rates.find(r => r.code === 'CHF')?.mid || 4.3911,
            JPY: rates.find(r => r.code === 'JPY')?.mid || 0.025955,
            AUD: rates.find(r => r.code === 'AUD')?.mid || 2.4372,
            CAD: rates.find(r => r.code === 'CAD')?.mid || 2.7046,
            NZD: rates.find(r => r.code === 'NZD')?.mid || 2.2311,
            ZAR: rates.find(r => r.code === 'ZAR')?.mid || 0.2127,
            BRL: rates.find(r => r.code === 'BRL')?.mid || 0.6832,
            CNY: rates.find(r => r.code === 'CNY')?.mid || 0.5347,
            // Add approximate rates for other currencies
            ZWL: 0.0012, // Zimbabwe Dollar (approximate)
            NGN: 0.0045, // Nigerian Naira (approximate)
            KES: 0.028,  // Kenyan Shilling (approximate)
            EGP: 0.125,  // Egyptian Pound (approximate)
            MAD: 0.385,  // Moroccan Dirham (approximate)
            ETH: 12000   // Ethereum (approximate in PLN)
        };

        res.json({
            success: true,
            rates: formattedRates,
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error fetching exchange rates:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch exchange rates'
        });
    }
});

// Calculate transfer amount with fees
app.post('/api/calculate-transfer', async (req, res) => {
    try {
        const { amount, fromCurrency, toCurrency, fromCountry, toCountry } = req.body;

        // Fetch current exchange rates
        const response = await axios.get('https://api.nbp.pl/api/exchangerates/tables/A/');
        const rates = response.data[0].rates;
        
        // Convert NBP rates to our format
        const formattedRates = {
            USD: rates.find(r => r.code === 'USD')?.mid || 3.8774,
            EUR: rates.find(r => r.code === 'EUR')?.mid || 4.1979,
            GBP: rates.find(r => r.code === 'GBP')?.mid || 5.0148,
            CHF: rates.find(r => r.code === 'CHF')?.mid || 4.3911,
            JPY: rates.find(r => r.code === 'JPY')?.mid || 0.025955,
            AUD: rates.find(r => r.code === 'AUD')?.mid || 2.4372,
            CAD: rates.find(r => r.code === 'CAD')?.mid || 2.7046,
            NZD: rates.find(r => r.code === 'NZD')?.mid || 2.2311,
            ZAR: rates.find(r => r.code === 'ZAR')?.mid || 0.2127,
            BRL: rates.find(r => r.code === 'BRL')?.mid || 0.6832,
            CNY: rates.find(r => r.code === 'CNY')?.mid || 0.5347,
            // Add approximate rates for other currencies
            ZWL: 0.0012, // Zimbabwe Dollar (approximate)
            NGN: 0.0045, // Nigerian Naira (approximate)
            KES: 0.028,  // Kenyan Shilling (approximate)
            EGP: 0.125,  // Egyptian Pound (approximate)
            MAD: 0.385,  // Moroccan Dirham (approximate)
            ETH: 12000   // Ethereum (approximate in PLN)
        };

        // Get rates for both currencies
        const fromRate = formattedRates[fromCurrency] || 1;
        const toRate = formattedRates[toCurrency] || 1;

        // Calculate exchange rate between currencies
        const exchangeRate = toRate / fromRate;

        // Calculate converted amount
        const convertedAmount = amount * exchangeRate;

        // Calculate transfer fee based on country
        const transferFee = convertedAmount * (TRANSFER_FEES[toCountry] || 0.005);

        // Calculate blockchain fee if using ETH
        let blockchainFee = 0;
        if (fromCurrency === 'ETH' || toCurrency === 'ETH') {
            const gasPrice = await web3.eth.getGasPrice();
            const gasLimit = 21000; // Standard ETH transfer
            blockchainFee = web3.utils.fromWei((BigInt(gasPrice) * BigInt(gasLimit)).toString(), 'ether');
        }

        // Calculate total amount
        const totalAmount = convertedAmount + transferFee + blockchainFee;

        res.json({
            success: true,
            exchangeRate: exchangeRate.toFixed(4),
            convertedAmount: convertedAmount,
            transferFee: transferFee,
            blockchainFee: blockchainFee,
            totalAmount: totalAmount
        });
    } catch (error) {
        console.error('Error calculating transfer:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate transfer amount'
        });
    }
});

// Process blockchain transfer
app.post('/api/process-transfer', async (req, res) => {
    try {
        const { fromAddress, toAddress, amount, currency } = req.body;
        
        // Create transaction
        const transaction = {
            from: fromAddress,
            to: toAddress,
            value: web3.utils.toWei(amount.toString(), 'ether')
        };
        
        // Get gas estimate
        const gasEstimate = await web3.eth.estimateGas(transaction);
        
        // Add gas price
        const gasPrice = await web3.eth.getGasPrice();
        
        // Calculate total cost
        const totalCost = web3.utils.fromWei(
            (BigInt(gasEstimate) * BigInt(gasPrice)).toString(),
            'ether'
        );
        
        res.json({
            success: true,
            gasEstimate: gasEstimate,
            gasPrice: gasPrice,
            totalCost: totalCost
        });
    } catch (error) {
        console.error('Blockchain transfer error:', error);
        res.status(500).json({ success: false, message: 'Error processing blockchain transfer' });
    }
});

// Registration endpoint
app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password } = req.body;

        // Generate verification token (in a real app, you'd store this in a database)
        const verificationToken = Math.random().toString(36).substring(2, 15);

        // Email content
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Verify your GlobalTransfer account',
            html: `
                <h1>Welcome to GlobalTransfer!</h1>
                <p>Dear ${fullName},</p>
                <p>Thank you for registering with GlobalTransfer. Please click the link below to verify your account:</p>
                <a href="http://localhost:${port}/verify?token=${verificationToken}">Verify Account</a>
                <p>If you didn't create an account, please ignore this email.</p>
            `
        };

        // Send email
        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: 'Registration successful. Please check your email to verify your account.' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: 'Error during registration' });
    }
});

// Password reset endpoint
app.post('/api/reset-password', async (req, res) => {
    try {
        const { email } = req.body;

        // Generate reset token (in a real app, you'd store this in a database)
        const resetToken = Math.random().toString(36).substring(2, 15);

        // Email content
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Reset your GlobalTransfer password',
            html: `
                <h1>Password Reset Request</h1>
                <p>You have requested to reset your password. Click the link below to set a new password:</p>
                <a href="http://localhost:${port}/reset-password?token=${resetToken}">Reset Password</a>
                <p>If you didn't request a password reset, please ignore this email.</p>
            `
        };

        // Send email
        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: 'Password reset link has been sent to your email.' });
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ success: false, message: 'Error sending password reset email' });
    }
});

// Start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
}); 