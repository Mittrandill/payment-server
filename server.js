require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Iyzipay = require('iyzipay');

const app = express();
app.use(express.json());

// İyzipay oluşturmadan önce env değerlerini kontrol et
console.log('ENV values:', {
  apiKey: process.env.IYZICO_API_KEY,
  secretKey: process.env.IYZICO_SECRET_KEY,
  uri: process.env.IYZICO_URI
});

const iyzipay = new Iyzipay({
  apiKey: process.env.IYZICO_API_KEY,
  secretKey: process.env.IYZICO_SECRET_KEY,
  uri: process.env.IYZICO_URI
});

// İyzipay objesi oluşturulduktan sonra kontrol et
console.log('Iyzipay config:', iyzipay);
app.use(cors({
 origin: 'http://localhost:5173',
 credentials: true,
 methods: ['GET', 'POST']
}));

app.get('/api/payment/health', (req, res) => {
  res.json({ status: 'ok' });
 });
 
 app.get('/api/payment/test', (req, res) => {
  res.json({ message: 'Payment server is working!' });
 });
 
 app.post('/api/payment/create', async (req, res) => {
   try {
     console.log('Payment request received:', req.body);
     const { price, userId, cardDetails } = req.body;
 
     const request = {
       locale: Iyzipay.LOCALE.TR,
       conversationId: new Date().getTime().toString(),
       price: price.toString(),
       paidPrice: price.toString(),
      currency: 'TRY',
      installment: '1',
      basketId: 'B67832',
      paymentChannel: 'WEB',
      paymentGroup: 'PRODUCT',
      paymentCard: {
        cardHolderName: cardDetails.cardHolderName,
        cardNumber: cardDetails.cardNumber,
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
        ip: '85.34.78.112',
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
          name: 'Payment',
          category1: 'Service',
          itemType: 'VIRTUAL',
          price: price
        }
      ]
    };
 
    iyzipay.payment.create(request, function (err, result) {
     console.log('Iyzipay response:', err || result);  // Bu satırı ekleyin
     if (err) {
       return res.status(400).json({
         error: true,
         message: err.errorMessage || 'Ödeme işlemi başarısız'
       });
     }
     res.json(result);
   });
 } catch (error) {
   console.error('Server error:', error);
   res.status(500).json({
     error: true,
     message: error.message
   });
 }
 });

// Abonelik iptali
app.post('/api/subscription/cancel', async (req, res) => {
  try {
    const { subscriptionReferenceCode } = req.body;

    iyzipay.subscription.cancel({
      subscriptionReferenceCode: subscriptionReferenceCode,
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


const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));