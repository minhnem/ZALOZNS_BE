import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import Campaign from '../models/Campaign.js';
import ZnsLog from '../models/ZnsLog.js';
import SalesOrder from '../models/SalesOrder.js';
import Product from '../models/Product.js';
import ProductBatch from '../models/ProductBatch.js';
import StockMovement from '../models/StockMovement.js';
import ExpiryAlert from '../models/ExpiryAlert.js';

// ═══════════════════════════════════════════════════
// 1. BÁO CÁO DOANH SỐ & TÀI CHÍNH (SALES & PROFIT)
// ═══════════════════════════════════════════════════
export const getSalesReport = async (req, res) => {
  try {
    const { startDate, endDate, cashier_id } = req.query;

    const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const matchQuery = {
      status: 'completed',
      createdAt: { $gte: start, $lte: end }
    };

    if (cashier_id) {
      matchQuery.cashier_id = new mongoose.Types.ObjectId(cashier_id);
    }

    const orders = await SalesOrder.find(matchQuery).sort({ createdAt: 1 }).lean();

    let totalRevenue = 0;
    let totalSubtotal = 0;
    let totalDiscount = 0;
    let totalCogs = 0;
    let totalItemsSold = 0;

    const paymentMap = { CASH: 0, TRANSFER: 0, CARD: 0, OTHER: 0 };
    const paymentCountMap = { CASH: 0, TRANSFER: 0, CARD: 0, OTHER: 0 };
    const cashierMap = {};
    const productSalesMap = {};
    const dailyMap = {};

    orders.forEach(order => {
      const finalAmt = order.final_amount || 0;
      totalRevenue += finalAmt;
      totalSubtotal += (order.subtotal_amount || 0);
      totalDiscount += (order.discount_amount || 0);
      totalItemsSold += (order.total_quantity || 0);

      // Phương thức thanh toán
      const pm = order.payment_method || 'CASH';
      paymentMap[pm] = (paymentMap[pm] || 0) + finalAmt;
      paymentCountMap[pm] = (paymentCountMap[pm] || 0) + 1;

      // Nhân viên thu ngân
      const cName = order.cashier_name || 'Không rõ';
      if (!cashierMap[cName]) {
        cashierMap[cName] = { cashier_name: cName, ordersCount: 0, totalSales: 0 };
      }
      cashierMap[cName].ordersCount++;
      cashierMap[cName].totalSales += finalAmt;

      // Nhóm theo ngày cho biểu đồ
      const d = new Date(order.createdAt);
      const dayKey = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!dailyMap[dayKey]) {
        dailyMap[dayKey] = {
          date: dayKey,
          timestamp: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(),
          revenue: 0,
          orders: 0,
          cogs: 0,
          profit: 0
        };
      }
      dailyMap[dayKey].revenue += finalAmt;
      dailyMap[dayKey].orders++;

      // Tính giá vốn (COGS) và thống kê sản phẩm bán chạy
      let orderCost = 0;
      if (Array.isArray(order.items)) {
        order.items.forEach(item => {
          const qty = item.quantity || 1;
          const itemCost = (item.cost_price || 0) * qty;
          const itemRev = item.subtotal || ((item.unit_price || 0) * qty);
          totalCogs += itemCost;
          orderCost += itemCost;

          const pKey = item.product_id?.toString() || item.product_name;
          if (!productSalesMap[pKey]) {
            productSalesMap[pKey] = {
              product_id: item.product_id,
              product_name: item.product_name,
              product_sku: item.product_sku || '',
              unit: item.unit || 'Cái',
              quantity: 0,
              revenue: 0,
              cogs: 0,
              profit: 0
            };
          }
          productSalesMap[pKey].quantity += qty;
          productSalesMap[pKey].revenue += itemRev;
          productSalesMap[pKey].cogs += itemCost;
          productSalesMap[pKey].profit += (itemRev - itemCost);
        });
      }

      dailyMap[dayKey].cogs += orderCost;
      dailyMap[dayKey].profit += (finalAmt - orderCost);
    });

    const grossProfit = totalRevenue - totalCogs;
    const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const avgOrderValue = orders.length > 0 ? Math.round(totalRevenue / orders.length) : 0;

    const timeline = Object.values(dailyMap).sort((a, b) => a.timestamp - b.timestamp);
    const topProducts = Object.values(productSalesMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
    const cashierStats = Object.values(cashierMap).sort((a, b) => b.totalSales - a.totalSales);

    res.status(200).json({
      summary: {
        totalOrders: orders.length,
        totalRevenue,
        totalSubtotal,
        totalDiscount,
        totalCogs,
        grossProfit,
        profitMargin: Number(profitMargin.toFixed(2)),
        avgOrderValue,
        totalItemsSold
      },
      paymentMethods: Object.keys(paymentMap).map(k => ({
        method: k,
        amount: paymentMap[k],
        count: paymentCountMap[k],
        percentage: totalRevenue > 0 ? Number(((paymentMap[k] / totalRevenue) * 100).toFixed(1)) : 0
      })),
      timeline,
      topProducts,
      cashierStats,
      recentOrders: orders.slice(-15).reverse()
    });
  } catch (error) {
    console.error('Error fetching sales report:', error);
    res.status(500).json({ message: 'Lỗi khi lấy báo cáo doanh số', error: error.message });
  }
};

// ═══════════════════════════════════════════════════
// 2. BÁO CÁO TỒN KHO & ĐỊNH GIÁ KHO (INVENTORY VALUATION)
// ═══════════════════════════════════════════════════
export const getInventoryReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const end = endDate ? new Date(endDate) : null;
    if (end) end.setHours(23, 59, 59, 999);
    const today = new Date();
    const isPast = !!(end && end < today);

    const products = await Product.find().populate('category_id', 'name').lean();
    const batches = await ProductBatch.find({ status: { $ne: 'destroyed' } }).lean();

    // Nếu lọc ngày kết thúc trong quá khứ, tính lùi các biến động sau ngày đó
    const afterPeriodMovements = isPast ? await StockMovement.find({
      createdAt: { $gt: end }
    }).lean() : [];

    const afterDeltaMap = {};
    afterPeriodMovements.forEach(m => {
      const pid = m.product_id?.toString();
      afterDeltaMap[pid] = (afterDeltaMap[pid] || 0) + (m.quantity || 0);
    });

    let totalStockUnits = 0;
    let totalCostValue = 0;
    let totalRetailValue = 0;

    let activeCount = 0;
    let outOfStockCount = 0;
    let lowStockCount = 0;

    const categoryMap = {};

    const batchesByProduct = {};
    batches.forEach(b => {
      const pid = b.product_id?.toString();
      if (!batchesByProduct[pid]) batchesByProduct[pid] = [];
      batchesByProduct[pid].push(b);
    });

    products.forEach(p => {
      if (p.status === 'active') activeCount++;

      const pBatches = batchesByProduct[p._id.toString()] || [];
      let pStock = 0;
      let pCostVal = 0;

      if (isPast) {
        // Tồn kho lùi về thời điểm mốc endDate
        const currentStock = p.total_stock || 0;
        pStock = Math.max(0, currentStock - (afterDeltaMap[p._id.toString()] || 0));
        pCostVal = pStock * (p.cost_price || 0);
      } else {
        // Tồn kho hiện tại thời gian thực
        if (pBatches.length > 0) {
          pBatches.forEach(b => {
            const qty = b.quantity_in_stock || 0;
            pStock += qty;
            pCostVal += (qty * (b.cost_price || p.cost_price || 0));
          });
        } else {
          pStock = p.total_stock || 0;
          pCostVal = pStock * (p.cost_price || 0);
        }
      }

      if (pStock <= 0) outOfStockCount++;
      else if (pStock <= 5) lowStockCount++;

      const pRetailVal = pStock * (p.sell_price || 0);

      totalStockUnits += pStock;
      totalCostValue += pCostVal;
      totalRetailValue += pRetailVal;

      const catName = p.category_id?.name || p.category || 'Khác';
      if (!categoryMap[catName]) {
        categoryMap[catName] = {
          category: catName,
          productCount: 0,
          totalUnits: 0,
          totalCostValue: 0,
          totalRetailValue: 0
        };
      }
      categoryMap[catName].productCount++;
      categoryMap[catName].totalUnits += pStock;
      categoryMap[catName].totalCostValue += pCostVal;
      categoryMap[catName].totalRetailValue += pRetailVal;
    });

    const potentialProfit = totalRetailValue - totalCostValue;
    const potentialMargin = totalRetailValue > 0 ? (potentialProfit / totalRetailValue) * 100 : 0;

    const categories = Object.values(categoryMap).map(c => ({
      ...c,
      percentage: totalCostValue > 0 ? Number(((c.totalCostValue / totalCostValue) * 100).toFixed(1)) : 0
    })).sort((a, b) => b.totalCostValue - a.totalCostValue);

    const topStockProducts = products
      .map(p => {
        const pStock = isPast ? Math.max(0, (p.total_stock || 0) - (afterDeltaMap[p._id.toString()] || 0)) : (p.total_stock || 0);
        return {
          _id: p._id,
          name: p.name,
          sku: p.sku || '',
          category: p.category_id?.name || p.category || 'Khác',
          total_stock: pStock,
          unit: p.unit || 'Cái',
          cost_price: p.cost_price || 0,
          sell_price: p.sell_price || 0,
          cost_value: pStock * (p.cost_price || 0)
        };
      })
      .sort((a, b) => (b.total_stock || 0) - (a.total_stock || 0))
      .slice(0, 10);

    const lowStockAlerts = products
      .map(p => {
        const pStock = isPast ? Math.max(0, (p.total_stock || 0) - (afterDeltaMap[p._id.toString()] || 0)) : (p.total_stock || 0);
        return {
          _id: p._id,
          name: p.name,
          sku: p.sku || '',
          category: p.category_id?.name || p.category || 'Khác',
          total_stock: pStock,
          unit: p.unit || 'Cái',
          sell_price: p.sell_price || 0
        };
      })
      .filter(p => (p.total_stock || 0) <= 5)
      .sort((a, b) => (a.total_stock || 0) - (b.total_stock || 0))
      .slice(0, 15);

    res.status(200).json({
      summary: {
        totalProducts: products.length,
        activeCount,
        outOfStockCount,
        lowStockCount,
        totalStockUnits,
        totalCostValue,
        totalRetailValue,
        potentialProfit,
        potentialMargin: Number(potentialMargin.toFixed(2)),
        asOfDate: end ? end.toISOString() : null,
        isPast: !!isPast
      },
      categories,
      topStockProducts,
      lowStockAlerts
    });
  } catch (error) {
    console.error('Error fetching inventory report:', error);
    res.status(500).json({ message: 'Lỗi khi lấy báo cáo tồn kho', error: error.message });
  }
};

// ═══════════════════════════════════════════════════
// 3. BÁO CÁO HẠN SỬ DỤNG & THIỆT HẠI HỦY HÀNG (EXPIRY & LOSS)
// ═══════════════════════════════════════════════════
export const getExpiryReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const batches = await ProductBatch.find({
      status: { $in: ['active', 'near_expiry', 'expired'] },
      quantity_in_stock: { $gt: 0 }
    }).populate('product_id', 'name unit sell_price category').lean();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const breakdown = {
      expired: { count: 0, units: 0, riskValue: 0 },
      near_30: { count: 0, units: 0, riskValue: 0 },
      near_60: { count: 0, units: 0, riskValue: 0 },
      near_90: { count: 0, units: 0, riskValue: 0 },
      safe: { count: 0, units: 0, riskValue: 0 }
    };

    const criticalBatches = [];

    batches.forEach(b => {
      const exp = new Date(b.expiry_date);
      exp.setHours(0, 0, 0, 0);
      const daysLeft = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const units = b.quantity_in_stock || 0;
      const riskVal = units * (b.cost_price || 0);

      if (daysLeft <= 0) {
        breakdown.expired.count++;
        breakdown.expired.units += units;
        breakdown.expired.riskValue += riskVal;
      } else if (daysLeft <= 30) {
        breakdown.near_30.count++;
        breakdown.near_30.units += units;
        breakdown.near_30.riskValue += riskVal;
      } else if (daysLeft <= 60) {
        breakdown.near_60.count++;
        breakdown.near_60.units += units;
        breakdown.near_60.riskValue += riskVal;
      } else if (daysLeft <= 90) {
        breakdown.near_90.count++;
        breakdown.near_90.units += units;
        breakdown.near_90.riskValue += riskVal;
      } else {
        breakdown.safe.count++;
        breakdown.safe.units += units;
        breakdown.safe.riskValue += riskVal;
      }

      if (daysLeft <= 90) {
        criticalBatches.push({
          _id: b._id,
          product_name: b.product_id?.name || 'Sản phẩm',
          unit: b.product_id?.unit || 'Cái',
          batch_number: b.batch_number,
          manufacturing_date: b.manufacturing_date,
          expiry_date: b.expiry_date,
          days_left: daysLeft,
          quantity_in_stock: units,
          cost_price: b.cost_price || 0,
          risk_value: riskVal,
          status: daysLeft <= 0 ? 'expired' : 'near_expiry'
        });
      }
    });

    criticalBatches.sort((a, b) => a.days_left - b.days_left);

    const totalRiskValue = breakdown.expired.riskValue + breakdown.near_30.riskValue + breakdown.near_60.riskValue + breakdown.near_90.riskValue;
    const totalRiskUnits = breakdown.expired.units + breakdown.near_30.units + breakdown.near_60.units + breakdown.near_90.units;

    // Lô hàng có ngày hết hạn rơi đúng vào khoảng thời gian lọc [start, end]
    const periodExpiringBatches = [];
    batches.forEach(b => {
      if (b.expiry_date) {
        const exp = new Date(b.expiry_date);
        if (exp >= start && exp <= end) {
          const units = b.quantity_in_stock || 0;
          const riskVal = units * (b.cost_price || 0);
          const daysLeft = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          periodExpiringBatches.push({
            _id: b._id,
            product_name: b.product_id?.name || 'Sản phẩm',
            unit: b.product_id?.unit || 'Cái',
            batch_number: b.batch_number,
            manufacturing_date: b.manufacturing_date,
            expiry_date: b.expiry_date,
            days_left: daysLeft,
            quantity_in_stock: units,
            cost_price: b.cost_price || 0,
            risk_value: riskVal,
            status: daysLeft <= 0 ? 'expired' : 'near_expiry'
          });
        }
      }
    });
    periodExpiringBatches.sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date));
    const periodExpiringUnits = periodExpiringBatches.reduce((acc, b) => acc + b.quantity_in_stock, 0);
    const periodExpiringRiskValue = periodExpiringBatches.reduce((acc, b) => acc + b.risk_value, 0);

    // Danh sách hủy hàng trong kỳ
    const disposals = await StockMovement.find({
      type: 'DISCARD',
      createdAt: { $gte: start, $lte: end }
    }).populate('product_id', 'name unit').populate('created_by', 'fullName email').sort({ createdAt: -1 }).lean();

    let totalDiscardUnits = 0;
    let totalDiscardValue = 0;

    disposals.forEach(d => {
      const q = Math.abs(d.quantity || 0);
      totalDiscardUnits += q;
      totalDiscardValue += (d.total_value || q * (d.unit_price || 0));
    });

    res.status(200).json({
      summary: {
        totalRiskValue,
        totalRiskUnits,
        totalRiskBatches: criticalBatches.length,
        totalDiscardUnits,
        totalDiscardValue,
        discardOperationsCount: disposals.length,
        periodExpiringCount: periodExpiringBatches.length,
        periodExpiringUnits,
        periodExpiringRiskValue,
        startDate: start.toISOString(),
        endDate: end.toISOString()
      },
      breakdown,
      criticalBatches,
      periodExpiringBatches,
      recentDisposals: disposals
    });
  } catch (error) {
    console.error('Error fetching expiry report:', error);
    res.status(500).json({ message: 'Lỗi khi lấy báo cáo hạn sử dụng', error: error.message });
  }
};

// ═══════════════════════════════════════════════════
// 4. BÁO CÁO XUẤT - NHẬP - TỒN (STOCK MOVEMENTS / XNT)
// ═══════════════════════════════════════════════════
export const getStockMovementReport = async (req, res) => {
  try {
    const { startDate, endDate, search, category } = req.query;
    const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const productQuery = { status: 'active' };
    if (search) {
      productQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
        { barcode: { $regex: search, $options: 'i' } }
      ];
    }
    if (category) {
      productQuery.category = category;
    }

    const products = await Product.find(productQuery).populate('category_id', 'name').lean();

    // Biến động trong kỳ [start, end]
    const inPeriodMovements = await StockMovement.find({
      createdAt: { $gte: start, $lte: end }
    }).lean();

    // Biến động sau kỳ (createdAt > end) để tính lùi Closing Stock
    const afterPeriodMovements = await StockMovement.find({
      createdAt: { $gt: end }
    }).lean();

    const afterDeltaMap = {};
    afterPeriodMovements.forEach(m => {
      const pid = m.product_id?.toString();
      afterDeltaMap[pid] = (afterDeltaMap[pid] || 0) + (m.quantity || 0);
    });

    const inPeriodMap = {};
    inPeriodMovements.forEach(m => {
      const pid = m.product_id?.toString();
      if (!inPeriodMap[pid]) {
        inPeriodMap[pid] = { in: 0, out: 0, adj: 0, discard: 0 };
      }
      const q = m.quantity || 0;
      if (m.type === 'IN') inPeriodMap[pid].in += q;
      else if (m.type === 'OUT') inPeriodMap[pid].out += Math.abs(q);
      else if (m.type === 'ADJUSTMENT') inPeriodMap[pid].adj += q;
      else if (m.type === 'DISCARD') inPeriodMap[pid].discard += Math.abs(q);
    });

    let grandOpeningUnits = 0;
    let grandInUnits = 0;
    let grandOutUnits = 0;
    let grandDiscardUnits = 0;
    let grandClosingUnits = 0;
    let grandClosingValue = 0;

    const reportData = products.map(p => {
      const pid = p._id.toString();
      const currentStock = p.total_stock || 0;
      const deltaAfter = afterDeltaMap[pid] || 0;
      const closingStock = currentStock - deltaAfter;

      const pInPeriod = inPeriodMap[pid] || { in: 0, out: 0, adj: 0, discard: 0 };
      const deltaPeriod = pInPeriod.in - pInPeriod.out + pInPeriod.adj - pInPeriod.discard;
      const openingStock = closingStock - deltaPeriod;
      const closingValue = closingStock * (p.cost_price || 0);

      grandOpeningUnits += openingStock;
      grandInUnits += pInPeriod.in;
      grandOutUnits += pInPeriod.out;
      grandDiscardUnits += pInPeriod.discard;
      grandClosingUnits += closingStock;
      grandClosingValue += closingValue;

      return {
        _id: p._id,
        name: p.name,
        sku: p.sku || '',
        category: p.category_id?.name || p.category || 'Khác',
        unit: p.unit || 'Cái',
        cost_price: p.cost_price || 0,
        sell_price: p.sell_price || 0,
        opening_stock: openingStock,
        total_in: pInPeriod.in,
        total_out: pInPeriod.out,
        total_adjustment: pInPeriod.adj,
        total_discard: pInPeriod.discard,
        closing_stock: closingStock,
        closing_value: closingValue
      };
    });

    reportData.sort((a, b) => b.closing_value - a.closing_value);

    res.status(200).json({
      summary: {
        totalProducts: products.length,
        grandOpeningUnits,
        grandInUnits,
        grandOutUnits,
        grandDiscardUnits,
        grandClosingUnits,
        grandClosingValue
      },
      movements: reportData
    });
  } catch (error) {
    console.error('Error fetching stock movement report:', error);
    res.status(500).json({ message: 'Lỗi khi lấy báo cáo xuất nhập tồn', error: error.message });
  }
};

// ═══════════════════════════════════════════════════
// 5. XUẤT FILE EXCEL CHO CÁC BÁO CÁO (EXCEL EXPORT)
// ═══════════════════════════════════════════════════
export const exportReportExcel = async (req, res) => {
  try {
    const { type = 'sales', startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const wb = XLSX.utils.book_new();

    if (type === 'sales') {
      const orders = await SalesOrder.find({
        status: 'completed',
        createdAt: { $gte: start, $lte: end }
      }).sort({ createdAt: -1 }).lean();

      const salesRows = orders.map((o, idx) => ({
        'STT': idx + 1,
        'Mã hóa đơn': o.order_code,
        'Thời gian': new Date(o.createdAt).toLocaleString('vi-VN'),
        'Khách hàng': o.customer_name || 'Khách lẻ',
        'Số điện thoại': o.customer_phone || '',
        'Thu ngân': o.cashier_name || '',
        'Phương thức thanh toán': o.payment_method === 'CASH' ? 'Tiền mặt' : o.payment_method === 'TRANSFER' ? 'Chuyển khoản' : 'Thẻ',
        'Tổng tiền hàng (VNĐ)': o.subtotal_amount || 0,
        'Chiết khấu (VNĐ)': o.discount_amount || 0,
        'Thực thu (VNĐ)': o.final_amount || 0
      }));

      const wsOrders = XLSX.utils.json_to_sheet(salesRows);
      XLSX.utils.book_append_sheet(wb, wsOrders, 'Danh_Sach_Hoa_Don');

      const pMap = {};
      orders.forEach(o => {
        (o.items || []).forEach(item => {
          const k = item.product_name;
          if (!pMap[k]) pMap[k] = { name: k, sku: item.product_sku || '', qty: 0, revenue: 0 };
          pMap[k].qty += (item.quantity || 0);
          pMap[k].revenue += (item.subtotal || 0);
        });
      });

      const topRows = Object.values(pMap).sort((a, b) => b.revenue - a.revenue).map((p, idx) => ({
        'Hạng': idx + 1,
        'Tên sản phẩm': p.name,
        'Mã SKU': p.sku,
        'Số lượng đã bán': p.qty,
        'Doanh thu (VNĐ)': p.revenue
      }));

      const wsTop = XLSX.utils.json_to_sheet(topRows);
      XLSX.utils.book_append_sheet(wb, wsTop, 'Top_SanPham_BanChay');
    } else if (type === 'inventory') {
      const end = endDate ? new Date(endDate) : null;
      if (end) end.setHours(23, 59, 59, 999);
      const isPast = !!(end && end < new Date());

      const products = await Product.find().populate('category_id', 'name').lean();
      const afterPeriodMovements = isPast ? await StockMovement.find({
        createdAt: { $gt: end }
      }).lean() : [];

      const afterDeltaMap = {};
      afterPeriodMovements.forEach(m => {
        const pid = m.product_id?.toString();
        afterDeltaMap[pid] = (afterDeltaMap[pid] || 0) + (m.quantity || 0);
      });

      const invRows = products.map((p, idx) => {
        const pStock = isPast ? Math.max(0, (p.total_stock || 0) - (afterDeltaMap[p._id.toString()] || 0)) : (p.total_stock || 0);
        return {
          'STT': idx + 1,
          'Mã SKU': p.sku || '',
          'Tên sản phẩm': p.name,
          'Danh mục': p.category_id?.name || p.category || 'Khác',
          'Đơn vị tính': p.unit || 'Cái',
          'Tồn kho': pStock,
          'Giá vốn (VNĐ)': p.cost_price || 0,
          'Giá bán (VNĐ)': p.sell_price || 0,
          'Tổng giá trị vốn (VNĐ)': pStock * (p.cost_price || 0),
          'Tổng giá trị bán (VNĐ)': pStock * (p.sell_price || 0)
        };
      });

      const wsInv = XLSX.utils.json_to_sheet(invRows);
      XLSX.utils.book_append_sheet(wb, wsInv, 'Bao_Cao_Ton_Kho');
    } else if (type === 'expiry') {
      const batches = await ProductBatch.find({
        status: { $in: ['active', 'near_expiry', 'expired'] },
        quantity_in_stock: { $gt: 0 }
      }).populate('product_id', 'name unit').lean();

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const expRows = batches.map((b, idx) => {
        const exp = new Date(b.expiry_date);
        exp.setHours(0, 0, 0, 0);
        const daysLeft = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return {
          'STT': idx + 1,
          'Tên sản phẩm': b.product_id?.name || '',
          'Mã lô hàng': b.batch_number,
          'Ngày sản xuất': b.manufacturing_date ? new Date(b.manufacturing_date).toLocaleDateString('vi-VN') : '',
          'Hạn sử dụng': new Date(b.expiry_date).toLocaleDateString('vi-VN'),
          'Số ngày còn lại': daysLeft,
          'Số lượng tồn': b.quantity_in_stock || 0,
          'Giá vốn (VNĐ)': b.cost_price || 0,
          'Vốn rủi ro (VNĐ)': (b.quantity_in_stock || 0) * (b.cost_price || 0),
          'Trạng thái': daysLeft <= 0 ? 'Đã quá hạn' : daysLeft <= 30 ? 'Cận date <= 30 ngày' : daysLeft <= 90 ? 'Cận date <= 90 ngày' : 'Bình thường'
        };
      }).sort((a, b) => a['Số ngày còn lại'] - b['Số ngày còn lại']);

      const wsExp = XLSX.utils.json_to_sheet(expRows);
      XLSX.utils.book_append_sheet(wb, wsExp, 'Can_Date_Va_Het_Han');
    } else if (type === 'stock-movement') {
      const products = await Product.find({ status: 'active' }).populate('category_id', 'name').lean();
      const inPeriodMovements = await StockMovement.find({ createdAt: { $gte: start, $lte: end } }).lean();
      const afterPeriodMovements = await StockMovement.find({ createdAt: { $gt: end } }).lean();

      const afterDeltaMap = {};
      afterPeriodMovements.forEach(m => {
        const pid = m.product_id?.toString();
        afterDeltaMap[pid] = (afterDeltaMap[pid] || 0) + (m.quantity || 0);
      });

      const inPeriodMap = {};
      inPeriodMovements.forEach(m => {
        const pid = m.product_id?.toString();
        if (!inPeriodMap[pid]) inPeriodMap[pid] = { in: 0, out: 0, adj: 0, discard: 0 };
        const q = m.quantity || 0;
        if (m.type === 'IN') inPeriodMap[pid].in += q;
        else if (m.type === 'OUT') inPeriodMap[pid].out += Math.abs(q);
        else if (m.type === 'ADJUSTMENT') inPeriodMap[pid].adj += q;
        else if (m.type === 'DISCARD') inPeriodMap[pid].discard += Math.abs(q);
      });

      const xntRows = products.map((p, idx) => {
        const pid = p._id.toString();
        const currentStock = p.total_stock || 0;
        const deltaAfter = afterDeltaMap[pid] || 0;
        const closingStock = currentStock - deltaAfter;

        const pInPeriod = inPeriodMap[pid] || { in: 0, out: 0, adj: 0, discard: 0 };
        const deltaPeriod = pInPeriod.in - pInPeriod.out + pInPeriod.adj - pInPeriod.discard;
        const openingStock = closingStock - deltaPeriod;
        const closingValue = closingStock * (p.cost_price || 0);

        return {
          'STT': idx + 1,
          'Mã SKU': p.sku || '',
          'Tên sản phẩm': p.name,
          'Danh mục': p.category_id?.name || p.category || 'Khác',
          'ĐVT': p.unit || 'Cái',
          'Tồn đầu kỳ': openingStock,
          'Tổng nhập': pInPeriod.in,
          'Tổng xuất (Bán)': pInPeriod.out,
          'Điều chỉnh': pInPeriod.adj,
          'Xuất hủy': pInPeriod.discard,
          'Tồn cuối kỳ': closingStock,
          'Giá vốn (VNĐ)': p.cost_price || 0,
          'Giá trị tồn cuối (VNĐ)': closingValue
        };
      });

      const wsXNT = XLSX.utils.json_to_sheet(xntRows);
      XLSX.utils.book_append_sheet(wb, wsXNT, 'Xuat_Nhap_Ton');
    }

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `Bao_Cao_${type}_${Date.now()}.xlsx`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (error) {
    console.error('Error exporting excel:', error);
    res.status(500).json({ message: 'Lỗi khi xuất file Excel', error: error.message });
  }
};

// ═══════════════════════════════════════════════════
// 6. BÁO CÁO CHIẾN DỊCH ZALO ZNS (GIỮ NGUYÊN TỪ PHIÊN BẢN CŨ)
// ═══════════════════════════════════════════════════
export const getCampaignReports = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const dateMatch = {};
    if (startDate) {
      dateMatch.$gte = new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateMatch.$lte = end;
    }

    const campaigns = await Campaign.find({}).lean();
    
    const aggregateQuery = [];
    if (Object.keys(dateMatch).length > 0) {
      aggregateQuery.push({ $match: { sentAt: dateMatch } });
    }

    aggregateQuery.push({
      $group: {
        _id: '$campaign_id',
        successCount: {
          $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
        },
        failedCount: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
        },
        skippedCount: {
          $sum: { $cond: [{ $eq: ['$status', 'skipped'] }, 1, 0] }
        },
        totalCount: { 
          $sum: { $cond: [{ $ne: ['$status', 'skipped'] }, 1, 0] }
        }
      }
    });

    const logStats = await ZnsLog.aggregate(aggregateQuery);

    const overallStats = { success: 0, failed: 0, skipped: 0 };
    const dailyMap = {};

    const result = campaigns.map(camp => {
      const stat = logStats.find(s => s._id && s._id.toString() === camp._id.toString()) || {
        successCount: 0,
        failedCount: 0,
        skippedCount: 0,
        totalCount: 0
      };
      
      return {
        _id: camp._id,
        name: camp.name,
        type: camp.type,
        status: camp.status,
        successCount: stat.successCount,
        failedCount: stat.failedCount,
        skippedCount: stat.skippedCount,
        totalCount: stat.totalCount
      };
    }).filter(camp => camp.totalCount > 0);

    const rawLogsMatch = { status: { $ne: 'skipped' } };
    if (Object.keys(dateMatch).length > 0) {
      rawLogsMatch.sentAt = dateMatch;
    }
    const rawLogs = await ZnsLog.find(rawLogsMatch).select('sentAt status').lean();
    rawLogs.forEach(log => {
      if (log.status === 'success') overallStats.success++;
      else if (log.status === 'failed') overallStats.failed++;
      else if (log.status === 'skipped') overallStats.skipped++;

      if (log.sentAt) {
        const d = new Date(log.sentAt);
        const dateString = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        if (!dailyMap[dateString]) dailyMap[dateString] = { success: 0, failed: 0, skipped: 0, date: dateString };
        if (log.status === 'success') dailyMap[dateString].success++;
        else if (log.status === 'failed') dailyMap[dateString].failed++;
        else if (log.status === 'skipped') dailyMap[dateString].skipped++;
      }
    });

    const dailyStats = Object.values(dailyMap).sort((a, b) => {
      const [dayA, monthA] = a.date.split('/');
      const [dayB, monthB] = b.date.split('/');
      return new Date(2000, monthA - 1, dayA) - new Date(2000, monthB - 1, dayB);
    });

    res.status(200).json({
      campaigns: result,
      overallStats,
      dailyStats
    });
  } catch (error) {
    console.error('Error fetching campaign reports:', error);
    res.status(500).json({ message: 'Lỗi khi lấy báo cáo chiến dịch', error: error.message });
  }
};

export const getCampaignDetailLogs = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const query = { campaign_id: id, status: { $ne: 'skipped' } };

    if (startDate || endDate) {
      query.sentAt = {};
      if (startDate) query.sentAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.sentAt.$lte = end;
      }
    }

    const logs = await ZnsLog.find(query)
      .populate('customerId', 'name phone baby_name baby_dob edd')
      .sort({ sentAt: -1 })
      .lean();

    res.status(200).json(logs);
  } catch (error) {
    console.error('Error fetching campaign logs:', error);
    res.status(500).json({ message: 'Lỗi khi lấy chi tiết chiến dịch', error: error.message });
  }
};
