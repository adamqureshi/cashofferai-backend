const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// NHTSA API Base URL (FREE - No API Key Required!)
const NHTSA_API_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles';

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Cash Offer AI Backend is running',
    timestamp: new Date().toISOString()
  });
});

// Vehicle decode endpoint using FREE NHTSA API
app.post('/api/vehicle/decode', async (req, res) => {
  const { vin } = req.body;
  
  if (!vin || vin.length !== 17) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid VIN. Must be 17 characters.' 
    });
  }

  try {
    // Decode VIN using FREE NHTSA API
    const decodeResponse = await axios.get(
      `${NHTSA_API_URL}/DecodeVinValues/${vin}?format=json`
    );

    const data = decodeResponse.data.Results[0];
    
    // Check if VIN was decoded successfully
    if (data.ErrorCode !== '0' && data.ErrorCode !== '1') {
      throw new Error('Unable to decode VIN');
    }
    
    // Extract and structure vehicle information
    const vehicle = {
      vin: vin,
      year: parseInt(data.ModelYear) || null,
      make: data.Make || 'Unknown',
      model: data.Model || 'Unknown',
      trim: data.Trim || data.Series || '',
      bodyClass: data.BodyClass || '',
      transmission: data.TransmissionStyle || '',
      driveType: data.DriveType || '',
      fuelType: data.FuelTypePrimary || '',
      doors: parseInt(data.Doors) || null,
      engineCylinders: parseInt(data.EngineCylinders) || null,
      engineDisplacement: parseFloat(data.DisplacementL) || null,
      engineHP: parseInt(data.EngineHP) || null,
      vehicleType: data.VehicleType || '',
      gvwr: data.GVWR || '',
      manufacturer: data.Manufacturer || '',
      plantCity: data.PlantCity || '',
      plantCountry: data.PlantCountry || ''
    };
    
    // Calculate base value based on vehicle characteristics
    const baseValue = calculateBaseValue(vehicle);
    const marketValue = Math.round(baseValue * 1.3); // Estimated original MSRP
    
    res.json({
      success: true,
      vehicle,
      baseValue,
      marketValue,
      message: `Successfully decoded ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      dataSource: 'NHTSA'
    });
    
  } catch (error) {
    console.error('VIN Decode Error:', error.message);
    
    // Return error
    res.status(500).json({ 
      success: false, 
      error: 'Failed to decode VIN. Please check the VIN and try again.',
      details: error.message 
    });
  }
});

// Get estimated value using Kelly Blue Book style calculation
app.post('/api/vehicle/value', async (req, res) => {
  const { year, make, model, mileage, condition, zip } = req.body;
  
  try {
    // Base value calculation
    let value = 30000; // Starting point
    
    // Depreciation based on age
    const currentYear = new Date().getFullYear();
    const age = currentYear - year;
    const depreciation = Math.min(age * 0.15, 0.85); // Max 85% depreciation
    value = value * (1 - depreciation);
    
    // Mileage adjustment
    const avgMileagePerYear = 12000;
    const expectedMileage = age * avgMileagePerYear;
    const mileageDiff = mileage - expectedMileage;
    if (mileageDiff > 0) {
      value -= (mileageDiff / 1000) * 50; // $50 per 1000 miles over
    }
    
    // Condition multipliers
    const conditionMultipliers = {
      'excellent': 1.1,
      'good': 1.0,
      'fair': 0.85,
      'poor': 0.65
    };
    value = value * (conditionMultipliers[condition] || 1.0);
    
    // Make/Model adjustments (simplified)
    const premiumMakes = ['Tesla', 'BMW', 'Mercedes-Benz', 'Audi', 'Lexus', 'Porsche', 'Land Rover', 'Cadillac'];
    const economyMakes = ['Kia', 'Hyundai', 'Nissan', 'Mitsubishi'];
    
    if (premiumMakes.includes(make)) {
      value *= 1.3;
    } else if (economyMakes.includes(make)) {
      value *= 0.85;
    }
    
    res.json({
      success: true,
      estimatedValue: Math.round(value),
      range: {
        low: Math.round(value * 0.9),
        high: Math.round(value * 1.1)
      },
      factors: {
        age,
        mileageDiff,
        condition,
        makeCategory: premiumMakes.includes(make) ? 'premium' : economyMakes.includes(make) ? 'economy' : 'standard'
      }
    });
    
  } catch (error) {
    console.error('Value estimation error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to estimate value' 
    });
  }
});

// Calculate offer endpoint
app.post('/api/offer/calculate', async (req, res) => {
  const { 
    vehicleData, 
    conditionData, 
    mileage, 
    zip,
    hasPhotos 
  } = req.body;
  
  try {
    // Start with base value
    let offerAmount = vehicleData.baseValue || 25000;
    
    // Apply condition adjustments
    const conditionAdjustments = {
      tires: -300,
      windshield: -200,
      lights: -500,
      accidents: -2000
    };
    
    Object.keys(conditionAdjustments).forEach(key => {
      if (conditionData[key] === false) {
        offerAmount += conditionAdjustments[key];
      }
    });
    
    // Mileage adjustment
    const currentYear = new Date().getFullYear();
    const vehicleAge = currentYear - (vehicleData.year || 2020);
    const expectedMileage = 12000 * vehicleAge;
    const mileageDiff = mileage - expectedMileage;
    
    if (mileageDiff > 0) {
      offerAmount -= Math.round((mileageDiff / 1000) * 50);
    }
    
    // Apply instant cash offer discount (typically 80-85% of retail value)
    offerAmount = Math.round(offerAmount * 0.83);
    
    // Confidence band based on photos
    const confidenceBand = hasPhotos ? 100 : 250;
    
    // Market comparisons (mock data with realistic values)
    const comparisons = [
      `Based on ${Math.floor(Math.random() * 15) + 10} similar vehicles sold in ${zip} area`,
      `Current market demand: ${['Strong', 'Moderate', 'Steady'][Math.floor(Math.random() * 3)]}`,
      `Standard reconditioning costs included in offer`
    ];
    
    res.json({
      success: true,
      offerAmount: Math.max(offerAmount, 1000), // Minimum $1000 offer
      confidenceBand,
      validDays: 7,
      validMiles: 300,
      comparisons,
      offerDetails: {
        retailValue: vehicleData.baseValue || 25000,
        conditionAdjustment: Object.keys(conditionAdjustments).reduce((sum, key) => {
          return sum + (conditionData[key] === false ? conditionAdjustments[key] : 0);
        }, 0),
        mileageAdjustment: mileageDiff > 0 ? -Math.round((mileageDiff / 1000) * 50) : 0,
        instantCashDiscount: Math.round(offerAmount * 0.17),
        finalOffer: Math.max(offerAmount, 1000)
      }
    });
    
  } catch (error) {
    console.error('Offer calculation error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to calculate offer' 
    });
  }
});

// Accept offer endpoint
app.post('/api/offer/accept', async (req, res) => {
  const { 
    conversationId,
    vehicleData,
    offerAmount,
    referenceId,
    acceptedAt 
  } = req.body;
  
  try {
    // In production, save to database
    console.log('Offer accepted:', {
      conversationId,
      vehicleData,
      offerAmount,
      referenceId,
      acceptedAt
    });
    
    // Send confirmation email (mock)
    // await sendConfirmationEmail(customerEmail, offerDetails);
    
    res.json({
      success: true,
      message: 'Offer accepted successfully',
      referenceId,
      nextSteps: [
        'Upload required documents',
        'Schedule pickup or drop-off',
        'Receive payment within 24 hours'
      ]
    });
    
  } catch (error) {
    console.error('Accept offer error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to process offer acceptance' 
    });
  }
});

// Local dealer auction endpoint
app.post('/api/auction/start', async (req, res) => {
  const { 
    vehicleData,
    offerAmount,
    zip 
  } = req.body;
  
  try {
    // In production, notify local dealers
    const auctionId = 'AUC-' + Date.now();
    
    res.json({
      success: true,
      auctionId,
      duration: 7200, // 2 hours in seconds
      notifiedDealers: Math.floor(Math.random() * 5) + 3,
      message: 'Local dealers have been notified and have 2 hours to submit offers'
    });
    
  } catch (error) {
    console.error('Auction start error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to start auction' 
    });
  }
});

// Document upload endpoint (mock)
app.post('/api/documents/upload', async (req, res) => {
  const { 
    documentType,
    documentData 
  } = req.body;
  
  try {
    // In production: 
    // 1. Validate document
    // 2. Run OCR if needed
    // 3. Store securely
    // 4. Update transaction record
    
    console.log(`Document uploaded: ${documentType}`);
    
    res.json({
      success: true,
      documentId: 'DOC-' + Date.now(),
      verified: true,
      message: `${documentType} uploaded and verified successfully`
    });
    
  } catch (error) {
    console.error('Document upload error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to upload document' 
    });
  }
});

// Schedule pickup endpoint
app.post('/api/schedule/book', async (req, res) => {
  const { 
    scheduleType,
    timeSlot,
    location,
    contactInfo 
  } = req.body;
  
  try {
    // In production, integrate with scheduling system
    const bookingId = 'BOOK-' + Date.now();
    
    res.json({
      success: true,
      bookingId,
      confirmationNumber: bookingId,
      scheduledDate: timeSlot,
      type: scheduleType,
      location: scheduleType === 'pickup' ? location : 'Nearest drop-off center',
      message: `${scheduleType === 'pickup' ? 'Pickup' : 'Drop-off'} scheduled successfully`,
      reminder: 'You will receive a confirmation email and SMS reminder'
    });
    
  } catch (error) {
    console.error('Schedule booking error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to schedule' 
    });
  }
});

// Handoff creation for complex cases
app.post('/api/handoff/create', async (req, res) => {
  const { 
    conversationId,
    vehicleData,
    reason,
    timestamp 
  } = req.body;
  
  try {
    // In production, create ticket in CRM/support system
    const ticketId = 'HAND-' + Date.now();
    
    console.log('Handoff created:', {
      ticketId,
      conversationId,
      vehicleData,
      reason,
      timestamp
    });
    
    res.json({
      success: true,
      ticketId,
      message: 'A specialist has been assigned to your case',
      estimatedResponseTime: '15 minutes',
      contactMethod: 'Phone call or text message'
    });
    
  } catch (error) {
    console.error('Handoff creation error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create handoff' 
    });
  }
});

// Get available time slots
app.get('/api/schedule/slots', async (req, res) => {
  const { zip, type } = req.query;
  
  try {
    // Generate available slots for next 3 days
    const slots = [];
    const now = new Date();
    
    for (let day = 0; day < 3; day++) {
      const date = new Date(now);
      date.setDate(date.getDate() + day);
      
      // Skip Sundays
      if (date.getDay() === 0) continue;
      
      const times = [
        '9:00 AM - 12:00 PM',
        '12:00 PM - 3:00 PM',
        '3:00 PM - 6:00 PM'
      ];
      
      times.forEach(time => {
        slots.push({
          date: date.toISOString().split('T')[0],
          time,
          available: Math.random() > 0.3, // 70% availability
          id: `${date.toISOString().split('T')[0]}_${time}`
        });
      });
    }
    
    res.json({
      success: true,
      slots,
      soonestAvailable: slots.find(s => s.available)
    });
    
  } catch (error) {
    console.error('Get slots error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get available slots' 
    });
  }
});

// Helper function to calculate base value
function calculateBaseValue(vehicle) {
  // Base pricing by vehicle type and age
  let baseValue = 25000;
  
  // Adjust by year (depreciation)
  const currentYear = new Date().getFullYear();
  const age = currentYear - (vehicle.year || 2020);
  
  // First year: 20% depreciation, then 15% per year for years 2-5, then 10% after
  let depreciationRate;
  if (age === 0) {
    depreciationRate = 0;
  } else if (age === 1) {
    depreciationRate = 0.20;
  } else if (age <= 5) {
    depreciationRate = 0.20 + ((age - 1) * 0.15);
  } else {
    depreciationRate = 0.20 + (4 * 0.15) + ((age - 5) * 0.10);
  }
  
  depreciationRate = Math.min(depreciationRate, 0.85); // Max 85% depreciation
  baseValue = baseValue * (1 - depreciationRate);
  
  // Adjust by make (brand value)
  const premiumMakes = ['Tesla', 'BMW', 'Mercedes-Benz', 'Audi', 'Lexus', 'Porsche', 'Land Rover', 'Genesis', 'Infiniti', 'Acura', 'Volvo', 'Jaguar', 'Maserati', 'Alfa Romeo'];
  const reliableMakes = ['Toyota', 'Honda', 'Mazda', 'Subaru'];
  const truckMakes = ['Ford', 'Chevrolet', 'GMC', 'Ram', 'Dodge'];
  
  if (premiumMakes.includes(vehicle.make)) {
    baseValue *= 1.4;
  } else if (reliableMakes.includes(vehicle.make)) {
    baseValue *= 1.15;
  } else if (truckMakes.includes(vehicle.make) && vehicle.bodyClass?.includes('Truck')) {
    baseValue *= 1.3; // Trucks hold value well
  }
  
  // Adjust by body type
  if (vehicle.bodyClass?.includes('SUV') || vehicle.bodyClass?.includes('Sport Utility')) {
    baseValue *= 1.2;
  } else if (vehicle.bodyClass?.includes('Truck') || vehicle.bodyClass?.includes('Pickup')) {
    baseValue *= 1.25;
  } else if (vehicle.bodyClass?.includes('Minivan')) {
    baseValue *= 0.9;
  } else if (vehicle.bodyClass?.includes('Convertible') || vehicle.bodyClass?.includes('Coupe')) {
    baseValue *= 1.1;
  }
  
  // Electric vehicle premium
  if (vehicle.fuelType?.includes('Electric')) {
    baseValue *= 1.2;
  } else if (vehicle.fuelType?.includes('Hybrid')) {
    baseValue *= 1.1;
  }
  
  // Engine size adjustment for performance vehicles
  if (vehicle.engineCylinders >= 8) {
    baseValue *= 1.15;
  } else if (vehicle.engineCylinders === 6) {
    baseValue *= 1.05;
  }
  
  return Math.max(Math.round(baseValue), 1000); // Minimum $1000
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /api/health',
      'POST /api/vehicle/decode',
      'POST /api/vehicle/value',
      'POST /api/offer/calculate',
      'POST /api/offer/accept',
      'POST /api/auction/start',
      'POST /api/documents/upload',
      'POST /api/schedule/book',
      'GET /api/schedule/slots',
      'POST /api/handoff/create'
    ]
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error',
    message: err.message 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Cash Offer AI Backend running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔧 Using FREE NHTSA VIN Decoder API - No API key required!`);
});

// Export for Vercel
module.exports = app;
