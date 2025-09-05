/* eslint-disable no-undef */
// Import using ES modules for Vercel compatibility
import 'dotenv/config';

/**
 * API handler for preferences
 * @param {import('@vercel/node').VercelRequest} req - The request object
 * @param {import('@vercel/node').VercelResponse} res - The response object
 */
export default async function handler(req, res) {
  // Add comprehensive logging for debugging
  console.log('=== PREFERENCES API CALLED ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  
  // Handle CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Import storage dynamically to avoid issues with module resolution
    const { storage } = await import('../server/storage.js');
    const { insertPreferenceSchema } = await import('../shared/schema.js');
    const { logInfo, logError } = await import('../server/simple-error-logger.js');

    console.log('Modules imported successfully');

    if (req.method === 'GET') {
      try {
        const deviceId = req.query.deviceId || req.cookies?.deviceId;
        
        if (!deviceId) {
          return res.status(400).json({ error: 'Device ID is required' });
        }

        const preferences = await storage.getPreferencesByDeviceId(deviceId);
        
        logInfo('Preferences retrieved', {
          deviceId,
          action: 'preferences_get',
          metadata: { 
            found: preferences ? 'yes' : 'no',
            count: preferences ? 1 : 0 
          }
        });
        
        return res.status(200).json({ 
          preferences: preferences || null,
          deviceId: deviceId 
        });
        
      } catch (error) {
        console.error('GET preferences error:', error);
        return res.status(500).json({ error: 'Failed to retrieve preferences' });
      }
    }

    if (req.method === 'POST') {
      try {
        
        // Get deviceId from request
        const deviceId = req.query.deviceId || req.cookies?.deviceId;
        
        if (!deviceId) {
          return res.status(400).json({ error: 'Device ID is required' });
        }
        
        // Add deviceId to the request body for validation
        const dataToValidate = {
          ...req.body,
          deviceId: deviceId
        };
        
        const validation = insertPreferenceSchema.safeParse(dataToValidate);
        
        if (!validation.success) {
          console.log('Validation failed:', validation.error);
          return res.status(400).json({ 
            error: 'Invalid request data',
            details: validation.error.errors 
          });
        }

        const preferenceData = validation.data;
        
        // Check if preferences already exist for this device
        const existingPreferences = await storage.getPreferencesByDeviceId(preferenceData.deviceId);
        
        let result;
        if (existingPreferences) {
          // Update existing preferences
          result = await storage.updatePreference(existingPreferences.id, preferenceData);
        } else {
          // Create new preferences
          result = await storage.createPreference(preferenceData);
        }
        
        
        logInfo(existingPreferences ? 'Preferences updated successfully' : 'Preferences saved successfully', {
          deviceId: preferenceData.deviceId,
          action: existingPreferences ? 'preferences_update' : 'preferences_save',
          metadata: { success: 'yes' }
        });
        
        return res.status(200).json({ 
          success: true, 
          preference: result,
          message: existingPreferences ? 'Preferences updated successfully' : 'Preferences saved successfully' 
        });
        
      } catch (error) {
        console.error('POST preferences error:', error);
        
        // Log the error
        const deviceId = req.body?.deviceId;
        if (deviceId) {
          logError('Failed to save preference', error, {
            deviceId,
            action: 'preferences_save',
            metadata: { success: 'no' }
          });
        }
        
        return res.status(500).json({ error: 'Failed to save preference' });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
    
  } catch (error) {
    console.error('Preferences API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
} 