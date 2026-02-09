const { pool } = require('./database');

// Save or update employee from face control event.
// Bir odam uchun faqat bitta yozuv: avval user_id, keyin ism (card_name/full_name) bo'yicha tekshiramiz, takroriy INSERT qilmaymiz.
async function saveEmployee(eventData) {
  try {
    const userId = eventData.UserID;
    const cardName = eventData.CardName || eventData.cardName || null;
    
    if (!userId) {
      return null;
    }

    const now = new Date();
    const normalizedName = cardName && String(cardName).trim() ? String(cardName).trim().toLowerCase().replace(/\s+/g, ' ') : null;

    // 1) Avval user_id bo'yicha topamiz
    const existingByUserId = await pool.query(
      'SELECT id, total_visits FROM employees WHERE user_id = $1',
      [userId]
    );

    if (existingByUserId.rows.length > 0) {
      // Mavjud xodim — faqat yangilaymiz (qayta INSERT yo'q)
      await pool.query(
        `UPDATE employees 
         SET card_name = COALESCE($1, card_name),
             last_seen_at = $2,
             total_visits = total_visits + 1,
             updated_at = $2
         WHERE user_id = $3`,
        [cardName, now, userId]
      );
      return existingByUserId.rows[0].id;
    }

    // 2) Yangi user_id — ism bo'yicha boshqa yozuv bormi? (bir odam = bitta yozuv, terminal boshqa ID bersa ham)
    if (normalizedName) {
      const existingByName = await pool.query(
        `SELECT id, user_id, total_visits FROM employees 
         WHERE (LOWER(TRIM(card_name)) = $1 OR LOWER(TRIM(full_name)) = $1)
         LIMIT 1`,
        [normalizedName]
      );
      if (existingByName.rows.length > 0) {
        const row = existingByName.rows[0];
        const oldUserId = row.user_id;
        // Shu ismdagi yozuvni yangi terminal user_id ga bog'laymiz, yangi qator ochmaymiz
        await pool.query(
          `UPDATE employees 
           SET user_id = $1,
               card_name = COALESCE($2, card_name),
               last_seen_at = $3,
               total_visits = total_visits + 1,
               updated_at = $3
           WHERE id = $4`,
          [userId, cardName, now, row.id]
        );
        // Eski user_id dagi davomat va eventlarni yangi user_id ga bog'laymiz
        if (oldUserId && oldUserId !== userId) {
          await pool.query('UPDATE attendance SET user_id = $1 WHERE user_id = $2', [userId, oldUserId]);
          await pool.query('UPDATE events SET user_id = $1 WHERE user_id = $2', [userId, oldUserId]);
        }
        return row.id;
      }
    }

    // 3) Hech qanday mos yozuv yo'q — yangi bitta yozuv (bir marta)
    const result = await pool.query(
      `INSERT INTO employees (user_id, card_name, full_name, first_seen_at, last_seen_at, total_visits)
       VALUES ($1, $2, $3, $4, $5, 1)
       RETURNING id`,
      [userId, cardName, cardName, now, now]
    );
    return result.rows[0].id;
  } catch (err) {
    console.error('[Employees] Error saving employee:', err.message);
    return null;
  }
}

// Update employee details (photo, position, organization)
async function updateEmployee(userId, data) {
  try {
    const { full_name, position, organization, photo_url, photo_base64, department_id, email, phone } = data;
    
    console.log(`[Employees] Updating employee ${userId} with data:`, { 
      hasFullName: !!full_name, 
      hasPosition: !!position, 
      hasOrganization: !!organization, 
      hasPhotoUrl: !!photo_url, 
      hasPhotoBase64: !!photo_base64 
    });
    
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (full_name !== undefined && full_name !== null && full_name !== '') {
      updates.push(`full_name = $${paramIndex++}`);
      values.push(full_name);
    }
    if (position !== undefined && position !== null && position !== '') {
      updates.push(`position = $${paramIndex++}`);
      values.push(position);
    }
    if (organization !== undefined && organization !== null && organization !== '') {
      updates.push(`organization = $${paramIndex++}`);
      values.push(organization);
    }
    if (department_id !== undefined && department_id !== null && department_id !== '') {
      updates.push(`department_id = $${paramIndex++}`);
      values.push(department_id);
    }
    if (photo_url !== undefined && photo_url !== null && photo_url !== '') {
      updates.push(`photo_url = $${paramIndex++}`);
      values.push(photo_url);
    }
    if (photo_base64 !== undefined && photo_base64 !== null && photo_base64 !== '') {
      updates.push(`photo_base64 = $${paramIndex++}`);
      values.push(photo_base64);
    }
    if (email !== undefined && email !== null && email !== '') {
      updates.push(`email = $${paramIndex++}`);
      values.push(email);
    }
    if (phone !== undefined && phone !== null && phone !== '') {
      updates.push(`phone = $${paramIndex++}`);
      values.push(phone);
    }

    if (updates.length === 0) {
      return { success: false, message: 'No fields to update' };
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(userId);

    const query = `
      UPDATE employees 
      SET ${updates.join(', ')}
      WHERE user_id = $${paramIndex}
      RETURNING id, user_id, card_name, full_name, position, organization, photo_url, photo_base64
    `;

    console.log(`[Employees] Executing query:`, query);
    console.log(`[Employees] With values:`, values);

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      console.log(`[Employees] Employee ${userId} not found in database`);
      return { success: false, message: 'Employee not found. Please make sure employee exists in database.' };
    }

    console.log(`[Employees] Employee ${userId} updated successfully`);
    return { success: true, employee: result.rows[0] };
  } catch (err) {
    console.error('[Employees] Error updating employee:', err.message);
    console.error('[Employees] Full error:', err);
    return { success: false, message: `Database error: ${err.message}` };
  }
}

// Save attendance record
async function saveAttendance(eventData, arrivalTime, minutesLate, isAbsent = false, isDeparture = false) {
  try {
    const userId = eventData.UserID;
    const cardName = eventData.CardName || eventData.cardName || null;
    
    if (!userId) {
      return null;
    }

    const date = new Date(arrivalTime);
    const dateOnly = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const status = isAbsent ? 'absent' : (minutesLate > 0 ? 'late' : 'ontime');

    // Check if attendance record exists for today
    const existing = await pool.query(
      'SELECT id, arrival_time, departure_time FROM attendance WHERE user_id = $1 AND date = $2',
      [userId, dateOnly]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      if (isDeparture) {
        // 18:00–23:59: faqat birinchi marta o'tgan = ketgan. departure_time bo'sh bo'lsa yangilash.
        if (!row.departure_time) {
          await pool.query(
            `UPDATE attendance 
             SET departure_time = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $2 AND date = $3`,
            [arrivalTime, userId, dateOnly]
          );
        }
      } else {
        // 00:00–18:00: nechi marta o'tishidan qat'iy nazar birinchi ro'yxatdan o'tgan = kelish. arrival_time bo'sh bo'lsa yangilash.
        if (!row.arrival_time) {
          await pool.query(
            `UPDATE attendance 
             SET arrival_time = $1,
                 minutes_late = $2,
                 status = $3,
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $4 AND date = $5`,
            [arrivalTime, minutesLate, status, userId, dateOnly]
          );
        }
      }
      return row.id;
    } else {
      // Create new attendance record
      if (isDeparture) {
        // 18:00 dan keyin kelgan = ketgan, faqat departure_time ni saqlash
        const result = await pool.query(
          `INSERT INTO attendance (user_id, card_name, departure_time, date)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [userId, cardName, arrivalTime, dateOnly]
        );
        return result.rows[0].id;
      } else {
        // 00:00 dan 18:00 gacha kelgan = kelgan, arrival_time va status ni saqlash
        const result = await pool.query(
          `INSERT INTO attendance (user_id, card_name, arrival_time, minutes_late, status, date)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [userId, cardName, arrivalTime, minutesLate, status, dateOnly]
        );
        return result.rows[0].id;
      }
    }
  } catch (err) {
    console.error('[Attendance] Error saving attendance:', err.message);
    return null;
  }
}

// Get all employees
async function getAllEmployees() {
  try {
    const result = await pool.query(
      `SELECT e.*, 
              d.name as department_name,
              (SELECT COUNT(*) FROM attendance WHERE user_id = e.user_id) as total_attendance,
              (SELECT arrival_time FROM attendance WHERE user_id = e.user_id ORDER BY date DESC LIMIT 1) as last_arrival
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       ORDER BY e.last_seen_at DESC`
    );
    return result.rows;
  } catch (err) {
    console.error('[Employees] Error fetching employees:', err.message);
    return [];
  }
}

// Get employee by user_id
async function getEmployeeByUserId(userId) {
  try {
    const result = await pool.query(
      `SELECT e.*, d.name as department_name
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE e.user_id = $1`,
      [userId]
    );
    return result.rows[0] || null;
  } catch (err) {
    console.error('[Employees] Error fetching employee:', err.message);
    return null;
  }
}

// Delete employee
async function deleteEmployee(userId) {
  try {
    // Delete attendance records first (foreign key constraint)
    await pool.query('DELETE FROM attendance WHERE user_id = $1', [userId]);
    
    // Delete employee
    const result = await pool.query(
      'DELETE FROM employees WHERE user_id = $1 RETURNING id',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return { success: false, message: 'Employee not found' };
    }
    
    return { success: true, message: 'Employee deleted successfully' };
  } catch (err) {
    console.error('[Employees] Error deleting employee:', err.message);
    return { success: false, message: `Database error: ${err.message}` };
  }
}

// Create demo employees
async function createDemoEmployees() {
  try {
    const demoEmployees = [
      { userId: '101', cardName: 'ALIYEV', fullName: 'Aliyev Alisher', position: 'Direktor', organization: 'Boshqarma', arrivalHour: 8, arrivalMin: 15 },
      { userId: '102', cardName: 'KARIMOV', fullName: 'Karimov Farhod', position: 'Bosh hisobchi', organization: 'Moliyaviy bo\'lim', arrivalHour: 8, arrivalMin: 30 },
      { userId: '103', cardName: 'TOSHMATOV', fullName: 'Toshmatov Rustam', position: 'Menejer', organization: 'Marketing', arrivalHour: 8, arrivalMin: 45 },
      { userId: '104', cardName: 'SALIMOV', fullName: 'Salimov Jamshid', position: 'Dasturchi', organization: 'IT bo\'lim', arrivalHour: 9, arrivalMin: 5 },
      { userId: '105', cardName: 'RAHIMOV', fullName: 'Rahimov Otabek', position: 'Dizayner', organization: 'IT bo\'lim', arrivalHour: 9, arrivalMin: 20 },
      { userId: '106', cardName: 'USMONOV', fullName: 'Usmonov Shohruh', position: 'Muhandis', organization: 'Texnik bo\'lim', arrivalHour: 9, arrivalMin: 40 },
      { userId: '107', cardName: 'NAZAROV', fullName: 'Nazarov Aziz', position: 'Kadrlar bo\'limi', organization: 'HR', arrivalHour: 10, arrivalMin: 0 },
      { userId: '108', cardName: 'HASANOV', fullName: 'Hasanov Bekzod', position: 'Sotuv menejeri', organization: 'Sotish bo\'limi', arrivalHour: 10, arrivalMin: 25 },
      { userId: '109', cardName: 'YULDASHEV', fullName: 'Yuldashev Temur', position: 'Auditor', organization: 'Audit bo\'limi', arrivalHour: 10, arrivalMin: 50 },
      { userId: '110', cardName: 'MAMADALIYEV', fullName: 'Mamadaliyev Sardor', position: 'Logistika menejeri', organization: 'Logistika', arrivalHour: 11, arrivalMin: 15 }
    ];

    const today = new Date();
    const created = [];

    for (const demo of demoEmployees) {
      // Check if already exists
      const existing = await pool.query(
        'SELECT id FROM employees WHERE user_id = $1',
        [demo.userId]
      );

      if (existing.rows.length > 0) {
        console.log(`[Demo] Employee ${demo.userId} already exists, skipping`);
        continue;
      }

      // Create arrival time for today
      const arrivalTime = new Date(today);
      arrivalTime.setHours(demo.arrivalHour, demo.arrivalMin, 0, 0);

      // Calculate minutes late (if after 9:00)
      const workStart = new Date(today);
      workStart.setHours(9, 0, 0, 0);
      const minutesLate = Math.max(0, Math.floor((arrivalTime - workStart) / 60000));

      // Insert employee
      const empResult = await pool.query(
        `INSERT INTO employees (user_id, card_name, full_name, position, organization, first_seen_at, last_seen_at, total_visits)
         VALUES ($1, $2, $3, $4, $5, $6, $6, 1)
         RETURNING id`,
        [demo.userId, demo.cardName, demo.fullName, demo.position, demo.organization, arrivalTime]
      );

      // Insert attendance record
      const dateOnly = arrivalTime.toISOString().split('T')[0];
      const status = minutesLate > 0 ? 'late' : 'ontime';
      
      await pool.query(
        `INSERT INTO attendance (user_id, card_name, arrival_time, minutes_late, status, date)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [demo.userId, demo.cardName, arrivalTime, minutesLate, status, dateOnly]
      );

      created.push(demo.userId);
      console.log(`[Demo] Created employee ${demo.userId}: ${demo.fullName}`);
    }

    return { success: true, created: created.length, message: `Created ${created.length} demo employees` };
  } catch (err) {
    console.error('[Demo] Error creating demo employees:', err.message);
    return { success: false, message: `Error: ${err.message}` };
  }
}

module.exports = {
  saveEmployee,
  saveAttendance,
  getAllEmployees,
  getEmployeeByUserId,
  updateEmployee,
  deleteEmployee,
  createDemoEmployees
};

