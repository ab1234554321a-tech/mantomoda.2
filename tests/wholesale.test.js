import assert from 'assert';
import { db } from '../src/server/db/store.js';

export async function runWholesaleTests() {
  console.log('\n💼 Running Wholesale Workflow & Approval Tests (ADR-002)...');

  // Create a new applicant user
  const applicant = db.createUser({
    fullName: 'تست مزون باران',
    email: 'baran.mezon@test.com',
    phone: '09359998877',
    password: 'password123',
    role: 'REGULAR'
  });

  assert.strictEqual(applicant.role, 'REGULAR');
  assert.strictEqual(applicant.isWholesaleVerified, false);
  console.log('  ✔ Passed: New applicant starts with REGULAR role and unverified wholesale status.');

  // Submit wholesale application
  const app = db.createApplication({
    userId: applicant.id,
    userFullName: applicant.fullName,
    userEmail: applicant.email,
    userPhone: applicant.phone,
    companyName: 'مزون باران اصفهان',
    economicCode: '1122334455',
    businessAddress: 'اصفهان، خیابان نظر میانی، کوچه کلیسا',
    city: 'اصفهان',
    province: 'اصفهان',
    businessPhone: '03136281111',
    storeType: 'PHYSICAL_STORE'
  });

  assert.ok(app.id, 'Application ID generated');
  assert.strictEqual(app.status, 'PENDING');
  console.log('  ✔ Passed: Wholesale application submitted in PENDING status.');

  // Admin Reviews and Approves Application
  const admin = db.findUserByEmail('admin@manto.ir');
  const reviewed = db.reviewApplication(app.id, {
    status: 'APPROVED',
    adminNotes: 'مدارک و جواز کسب بررسی و تایید گردید.',
    reviewerId: admin.id
  });

  assert.strictEqual(reviewed.status, 'APPROVED');

  // Verify User Role is upgraded in Database
  const upgradedUser = db.findUserById(applicant.id);
  assert.strictEqual(upgradedUser.role, 'WHOLESALE', 'User role must be upgraded to WHOLESALE');
  assert.strictEqual(upgradedUser.isWholesaleVerified, true, 'User isWholesaleVerified must be true');
  assert.strictEqual(upgradedUser.companyName, 'مزون باران اصفهان');
  console.log('  ✔ Passed: Admin approval successfully upgrades applicant role to WHOLESALE.');
}
