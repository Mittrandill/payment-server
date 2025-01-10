require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Iyzipay = require('iyzipay');

const app = express();
app.use(express.json());

// CORS yapılandırması
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://www.carion.com.tr',
  'https://carion.com.tr'
];

app.use(cors({
  origin: function(origin, callback) {
    // Allowed origins kontrolü
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS policy violation'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Iyzipay yapılandırması
const iyzipay = new Iyzipay({
  apiKey: process.env.IYZICO_API_KEY,
  secretKey: process.env.IYZICO_SECRET_KEY,
  uri: process.env.IYZICO_URI
});

// Hata yakalama middleware'i
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: true,
    message: err.message || 'Internal server error'
  });
};

// Health check endpoint'i
app.get('/api/payment/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Test endpoint'i
app.get('/api/payment/test', (req, res) => {
  res.json({ 
    message: 'Payment server is working!',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// Ödeme oluşturma endpoint'i
app.post('/api/payment/create', async (req, res) => {
  try {
    console.log('Payment request received:', req.body);
    const { price, userId, cardDetails } = req.body;

    if (!price || !userId || !cardDetails) {
      return res.status(400).json({
        error: true,
        message: 'Missing required fields'
      });
    }

    const request = {
      locale: Iyzipay.LOCALE.TR,
      conversationId: `${userId}_${Date.now()}`,
      price: price.toString(),
      paidPrice: price.toString(),
      currency: 'TRY',
      installment: '1',
      basketId: `B${Date.now()}`,
      paymentChannel: 'WEB',
      paymentGroup: 'PRODUCT',
      paymentCard: {
        cardHolderName: cardDetails.cardHolderName,
        cardNumber: cardDetails.cardNumber.replace(/\s/g, ''),
        expireMonth: cardDetails.expireMonth,
        expireYear: cardDetails.expireYear,
        cvc: cardDetails.cvc,
        registerCard: '0'
      },
      buyer: {
        id: userId,
        name: 'John',
        surname: 'Doe',
        email: 'email@email.com',
        identityNumber: '74300864791',
        registrationAddress: 'Nidakule Göztepe, Merdivenköy Mah. Bora Sok. No:1',
        ip: req.ip || '85.34.78.112',
        city: 'Istanbul',
        country: 'Turkey'
      },
      shippingAddress: {
        contactName: 'Jane Doe',
        city: 'Istanbul',
        country: 'Turkey',
        address: 'Nidakule Göztepe, Merdivenköy Mah. Bora Sok. No:1',
      },
      billingAddress: {
        contactName: 'Jane Doe',
        city: 'Istanbul',
        country: 'Turkey',
        address: 'Nidakule Göztepe, Merdivenköy Mah. Bora Sok. No:1',
      },
      basketItems: [
        {
          id: 'BI101',
          name: 'Subscription Payment',
          category1: 'Subscription',
          itemType: 'VIRTUAL',
          price: price
        }
      ]
    };

    iyzipay.payment.create(request, function (err, result) {
      console.log('Iyzipay response:', err || result);
      
      if (err) {
        return res.status(400).json({
          status: 'error',
          message: err.errorMessage || 'Payment failed',
          errorCode: err.errorCode
        });
      }

      // Başarılı ödeme durumu kontrolü
      if (result.status === 'success') {
        return res.json({
          status: 'success',
          paymentId: result.paymentId,
          ...result
        });
      } else {
        return res.status(400).json({
          status: 'error',
          message: result.errorMessage || 'Payment failed',
          errorCode: result.errorCode
        });
      }
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error'
    });
  }
});

// Abonelik iptal endpoint'i
app.post('/api/subscription/cancel', async (req, res) => {
  try {
    const { subscriptionReferenceCode } = req.body;

    if (!subscriptionReferenceCode) {
      return res.status(400).json({
        error: true,
        message: 'Subscription reference code is required'
      });
    }

    iyzipay.subscription.cancel({
      subscriptionReferenceCode,
      locale: Iyzipay.LOCALE.TR
    }, function (err, result) {
      if (err) {
        return res.status(400).json({
          status: 'error',
          message: err.errorMessage || 'Cancellation failed'
        });
      }
      res.json(result);
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error'
    });
  }
});

// Abonelik yükseltme/değiştirme
app.post('/api/subscription/upgrade', async (req, res) => {
  try {
    const { userId, newPlanPrice, cardDetails, currentSubscriptionReference } = req.body;

    // Önce mevcut aboneliği iptal et
    await new Promise((resolve, reject) => {
      iyzipay.subscription.cancel({
        subscriptionReferenceCode: currentSubscriptionReference,
        locale: Iyzipay.LOCALE.TR
      }, function (err, result) {
        if (err) reject(err);
        resolve(result);
      });
    });

    // Yeni abonelik oluştur
    const request = {
      locale: Iyzipay.LOCALE.TR,
      conversationId: Date.now().toString(),
      pricingPlanReferenceCode: newPlanPrice.toString(),
      subscriptionInitialStatus: "ACTIVE",
      paymentCard: {
        cardHolderName: cardDetails.cardHolderName,
        cardNumber: cardDetails.cardNumber.replace(/\s/g, ''),
        expireMonth: cardDetails.expireMonth,
        expireYear: cardDetails.expireYear,
        cvc: cardDetails.cvc
      },
      customer: {
        customerId: userId,
        email: "test@test.com",
        name: "John",
        surname: "Doe",
        identityNumber: "74300864791",
        shippingContactName: "John Doe",
        shippingCity: "Istanbul",
        shippingCountry: "Turkey",
        shippingAddress: "Test Address",
        billingContactName: "John Doe",
        billingCity: "Istanbul",
        billingCountry: "Turkey",
        billingAddress: "Test Address"
      }
    };

    iyzipay.subscription.initialize(request, function (err, result) {
      if (err) {
        return res.status(400).json(err);
      }
      res.json(result);
    });
  } catch (error) {
    res.status(500).json(error);
  }
});

// Abonelik durumu sorgulama
app.get('/api/subscription/status/:referenceCode', (req, res) => {
  try {
    const { referenceCode } = req.params;

    iyzipay.subscription.retrieve({
      subscriptionReferenceCode: referenceCode,
      locale: Iyzipay.LOCALE.TR
    }, function (err, result) {
      if (err) {
        return res.status(400).json(err);
      }
      res.json(result);
    });
  } catch (error) {
    res.status(500).json(error);
  }
});

// Ödeme Geçmişi
app.get('/api/payment/history/:userId', (req, res) => {
  try {
    const { userId } = req.params;

    iyzipay.subscriptionPayment.search({
      locale: Iyzipay.LOCALE.TR,
      conversationId: Date.now().toString(),
      subscriptionReferenceCode: userId,
      page: 1,
      count: 10,
      status: "SUCCESS"
    }, function (err, result) {
      if (err) {
        return res.status(400).json(err);
      }
      res.json(result);
    });
  } catch (error) {
    res.status(500).json(error);
  }
});

// Plan değişikliği
app.post('/api/subscription/change-plan', async (req, res) => {
  try {
    const { subscriptionReferenceCode, newPricingPlanReferenceCode } = req.body;

    iyzipay.subscription.upgrade({
      locale: Iyzipay.LOCALE.TR,
      conversationId: Date.now().toString(),
      subscriptionReferenceCode,
      newPricingPlanReferenceCode
    }, function (err, result) {
      if (err) {
        return res.status(400).json(err);
      }
      res.json(result);
    });
  } catch (error) {
    res.status(500).json(error);
  }
});

// Kart güncelleme
app.post('/api/subscription/update-card', async (req, res) => {
  try {
    const { subscriptionReferenceCode, cardDetails } = req.body;

    iyzipay.subscriptionCard.update({
      locale: Iyzipay.LOCALE.TR,
      conversationId: Date.now().toString(),
      subscriptionReferenceCode,
      cardHolderName: cardDetails.cardHolderName,
      cardNumber: cardDetails.cardNumber.replace(/\s/g, ''),
      expireMonth: cardDetails.expireMonth,
      expireYear: cardDetails.expireYear,
      cvc: cardDetails.cvc
    }, function (err, result) {
      if (err) {
        return res.status(400).json(err);
      }
      res.json(result);
    });
  } catch (error) {
    res.status(500).json(error);
  }
});

app.use(errorHandler);

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Payment server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
});