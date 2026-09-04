import { z } from 'zod';

// 1. Zod Schemas for Request Payloads
export const loginSchema = z.object({
  identifier: z.string().min(3, 'ایمیل یا شماره موبایل باید حداقل ۳ کاراکتر باشد').max(100),
  password: z.string().min(6, 'رمز عبور باید حداقل ۶ کاراکتر باشد').max(100)
});

export const registerSchema = z.object({
  fullName: z.string().min(3, 'نام و نام خانوادگی الزامی است').max(100),
  email: z.string().email('ایمیل وارد شده نامعتبر است').optional().or(z.literal('')),
  phone: z.string().regex(/^09\d{9}$/, 'شماره موبایل باید با ۰۹ شروع شده و ۱۱ رقم باشد'),
  password: z.string().min(6, 'رمز عبور باید حداقل ۶ کاراکتر باشد').max(100)
});

export const wholesaleApplySchema = z.object({
  companyName: z.string().min(2, 'نام فروشگاه/مزون الزامی است').max(150),
  economicCode: z.string().max(50).optional().default(''),
  province: z.string().min(2, 'استان الزامی است').max(50),
  city: z.string().min(2, 'شهر الزامی است').max(50),
  businessPhone: z.string().min(6, 'شماره تلفن ثابت کسب‌وکار الزامی است').max(20),
  storeType: z.enum(['PHYSICAL_STORE', 'ONLINE_SHOP', 'BOTH']).default('PHYSICAL_STORE'),
  businessAddress: z.string().min(5, 'آدرس دقیق فروشگاه الزامی است').max(500)
});

export const orderCheckoutSchema = z.object({
  items: z.array(z.object({
    productId: z.string().min(1, 'شناسه محصول الزامی است'),
    variantId: z.string().optional(),
    quantity: z.number().int('تعداد باید عدد صحیح باشد').positive('تعداد باید حداقل ۱ باشد')
  })).min(1, 'سبد خرید نمی‌تواند خالی باشد'),
  shippingAddress: z.object({
    recipientName: z.string().min(2, 'نام گیرنده الزامی است').max(100),
    phone: z.string().min(10, 'شماره تماس گیرنده نامعتبر است').max(15),
    province: z.string().min(2, 'استان الزامی است').max(50),
    city: z.string().min(2, 'شهر الزامی است').max(50),
    fullAddress: z.string().min(5, 'آدرس پستی الزامی است').max(500),
    postalCode: z.string().max(20).optional()
  }),
  paymentMethod: z.enum(['ONLINE_GATEWAY', 'BANK_TRANSFER_RECEIPT']).default('ONLINE_GATEWAY')
});

/**
 * Validation Middleware Factory
 */
export function validate(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.errors[0]?.message || 'داده‌های ورودی نامعتبر هستند.',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      }
      next(error);
    }
  };
}
