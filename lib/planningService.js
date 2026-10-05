/**
 * Financial Planning Service
 * Handles goal setting, calculations, and saving plan generation
 */

export const GOAL_TYPES = {
  CAR: 'car',
  PROPERTY: 'property', 
  JEWELRY: 'jewelry',
  TRAVEL: 'travel',
  OTHER: 'other'
};

export const PRIORITY_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
};

export const PLAN_TYPES = {
  COMFORTABLE: 'comfortable',
  BALANCED: 'balanced',
  AGGRESSIVE: 'aggressive'
};

/**
 * Validate planning input data
 */
export function validatePlanningInput(data) {
  const errors = [];

  if (!data.goal_name || data.goal_name.trim().length < 2) {
    errors.push('Goal name must be at least 2 characters');
  }

  if (!Object.values(GOAL_TYPES).includes(data.goal_type)) {
    errors.push('Invalid goal type');
  }

  if (!data.target_amount || data.target_amount <= 0) {
    errors.push('Target amount must be greater than 0');
  }

  if (data.current_savings < 0) {
    errors.push('Current savings cannot be negative');
  }

  if (!data.monthly_income || data.monthly_income <= 0) {
    errors.push('Monthly income must be greater than 0');
  }

  if (data.fixed_expenses < 0) {
    errors.push('Fixed expenses cannot be negative');
  }

  if (data.variable_expenses < 0) {
    errors.push('Variable expenses cannot be negative');
  }

  if (data.timeframe_months && data.timeframe_months <= 0) {
    errors.push('Timeframe must be greater than 0');
  }

  if (!Object.values(PRIORITY_LEVELS).includes(data.priority)) {
    errors.push('Invalid priority level');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Calculate monthly savings capacity
 */
export function calculateSavingsCapacity(monthlyIncome, fixedExpenses, variableExpenses) {
  return monthlyIncome - (fixedExpenses + variableExpenses);
}

/**
 * Calculate time to reach goal
 */
export function calculateTimeToGoal(targetAmount, currentSavings, monthlySavings) {
  const remainingAmount = targetAmount - currentSavings;
  if (remainingAmount <= 0) return 0;
  if (monthlySavings <= 0) return Infinity;
  return Math.ceil(remainingAmount / monthlySavings);
}

/**
 * Calculate required monthly savings for a given timeframe
 */
export function calculateRequiredMonthlySavings(targetAmount, currentSavings, timeframeMonths) {
  const remainingAmount = targetAmount - currentSavings;
  if (remainingAmount <= 0) return 0;
  return remainingAmount / timeframeMonths;
}

/**
 * Generate saving plans
 */
export function generateSavingPlans(savingsCapacity, targetAmount, currentSavings, timeframeMonths = null) {
  const remainingAmount = targetAmount - currentSavings;
  
  const plans = [];

  // Comfortable Plan (70% of savings capacity)
  const comfortableMonthly = savingsCapacity * 0.7;
  const comfortableTime = calculateTimeToGoal(targetAmount, currentSavings, comfortableMonthly);
  
  plans.push({
    type: PLAN_TYPES.COMFORTABLE,
    name: 'Comfortable Plan',
    monthly_saving: comfortableMonthly,
    estimated_time: comfortableTime,
    difficulty_level: 'Easy',
    description: 'Save comfortably while maintaining lifestyle',
    feasibility: comfortableMonthly > 0 ? 'feasible' : 'not feasible'
  });

  // Balanced Plan (90% of savings capacity)
  const balancedMonthly = savingsCapacity * 0.9;
  const balancedTime = calculateTimeToGoal(targetAmount, currentSavings, balancedMonthly);
  
  plans.push({
    type: PLAN_TYPES.BALANCED,
    name: 'Balanced Plan',
    monthly_saving: balancedMonthly,
    estimated_time: balancedTime,
    difficulty_level: 'Medium',
    description: 'Good balance between saving speed and comfort',
    feasibility: balancedMonthly > 0 ? 'feasible' : 'not feasible'
  });

  // Aggressive Plan (110-120% of savings capacity)
  const aggressiveMultiplier = savingsCapacity > 0 ? 1.2 : 1.0;
  const aggressiveMonthly = savingsCapacity * aggressiveMultiplier;
  const aggressiveTime = calculateTimeToGoal(targetAmount, currentSavings, aggressiveMonthly);
  
  plans.push({
    type: PLAN_TYPES.AGGRESSIVE,
    name: 'Aggressive Plan',
    monthly_saving: aggressiveMonthly,
    estimated_time: aggressiveTime,
    difficulty_level: 'Hard',
    description: 'Maximum savings - requires expense cutting',
    feasibility: savingsCapacity > 0 ? 'feasible' : 'not feasible',
    requires_expense_reduction: aggressiveMultiplier > 1.0
  });

  return plans;
}

/**
 * Generate insights and suggestions
 */
export function generateInsights(planningData, savingsCapacity, plans) {
  const insights = [];
  const suggestions = [];

  // Basic financial health insights
  const savingsRate = (savingsCapacity / planningData.monthly_income) * 100;
  
  if (savingsRate < 10) {
    insights.push('Your savings rate is below 10%. Consider reviewing expenses.');
    suggestions.push('Try to reduce variable expenses by 10-20%');
  } else if (savingsRate >= 20) {
    insights.push('Excellent savings rate! You\'re on track for financial success.');
  } else {
    insights.push('Good savings rate. Small adjustments could accelerate your goals.');
  }

  // Goal-specific insights
  const remainingAmount = planningData.target_amount - planningData.current_savings;
  const comfortablePlan = plans.find(p => p.type === PLAN_TYPES.COMFORTABLE);
  
  if (comfortablePlan && comfortablePlan.estimated_time > 60) {
    insights.push('This goal will take over 5 years with comfortable savings.');
    suggestions.push('Consider increasing income or reducing expenses to reach goals faster');
  }

  // Priority-based suggestions
  if (planningData.priority === PRIORITY_LEVELS.HIGH && comfortablePlan) {
    suggestions.push('For high priority goals, consider the Balanced or Aggressive plan');
  }

  // Feasibility check
  if (savingsCapacity <= 0) {
    insights.push('Your expenses exceed your income. This is not sustainable.');
    suggestions.push('Immediate action required: reduce expenses or increase income');
  }

  return {
    insights,
    suggestions,
    savings_rate: savingsRate.toFixed(1),
    monthly_savings_capacity: savingsCapacity
  };
}

/**
 * Calculate deviation from target and suggest adjustments
 */
export function calculateDeviationAnalysis(targetAmount, marketData) {
  if (!marketData || !marketData.averagePrice) {
    return {
      deviation: 0,
      deviationPercent: 0,
      suggestion: "No market data available for comparison",
      isOverBudget: false,
      isUnderBudget: false
    };
  }

  const deviation = targetAmount - marketData.averagePrice;
  const deviationPercent = (deviation / marketData.averagePrice) * 100;

  let suggestion = "";
  let isOverBudget = false;
  let isUnderBudget = false;

  if (deviationPercent > 20) {
    suggestion = `Your target is ${deviationPercent.toFixed(1)}% above market average. Consider if this premium is justified.`;
    isOverBudget = true;
  } else if (deviationPercent > 10) {
    suggestion = `Your target is ${deviationPercent.toFixed(1)}% above market average. Slightly high but reasonable.`;
  } else if (deviationPercent < -20) {
    suggestion = `Your target is ${Math.abs(deviationPercent).toFixed(1)}% below market average. This might be unrealistic.`;
    isUnderBudget = true;
  } else if (deviationPercent < -10) {
    suggestion = `Your target is ${Math.abs(deviationPercent).toFixed(1)}% below market average. Good value if achievable.`;
  } else {
    suggestion = `Your target is within 10% of market average. Well-researched target!`;
  }

  return {
    deviation,
    deviationPercent,
    suggestion,
    isOverBudget,
    isUnderBudget,
    marketAverage: marketData.averagePrice
  };
}

/**
 * Fetch market data for different goal types
 */
export async function fetchMarketData(goalType, targetAmount) {
  // Simulated market data - in real app, this would call actual APIs
  const marketData = {
    car: {
      averagePrice: 35000,
      priceRange: { min: 15000, max: 80000 },
      trends: "stable",
      recommendations: await getCarRecommendations(targetAmount)
    },
    property: {
      averagePrice: 300000,
      priceRange: { min: 150000, max: 1000000 },
      trends: "increasing",
      recommendations: []
    },
    jewelry: {
      averagePrice: 5000,
      priceRange: { min: 500, max: 50000 },
      trends: "stable",
      recommendations: []
    },
    travel: {
      averagePrice: 3000,
      priceRange: { min: 1000, max: 15000 },
      trends: "seasonal",
      recommendations: []
    },
    other: {
      averagePrice: targetAmount * 0.9, // Estimate 90% of target as market average
      priceRange: { min: targetAmount * 0.5, max: targetAmount * 1.5 },
      trends: "unknown",
      recommendations: []
    }
  };

  return marketData[goalType] || marketData.other;
}

/**
 * Get car recommendations based on price range
 */
export async function getCarRecommendations(targetAmount) {
  // Simulated car database - in real app, this would call car APIs
  const carDatabase = [
    { name: "Toyota Camry", price: 28000, rating: 4.5, fuel: "hybrid", reliability: "excellent" },
    { name: "Honda Accord", price: 30000, rating: 4.4, fuel: "gas", reliability: "excellent" },
    { name: "Mazda CX-5", price: 32000, rating: 4.6, fuel: "gas", reliability: "very good" },
    { name: "Toyota RAV4", price: 35000, rating: 4.7, fuel: "hybrid", reliability: "excellent" },
    { name: "Honda CR-V", price: 34000, rating: 4.5, fuel: "gas", reliability: "excellent" },
    { name: "Hyundai Elantra", price: 22000, rating: 4.3, fuel: "gas", reliability: "good" },
    { name: "Kia Sportage", price: 29000, rating: 4.4, fuel: "gas", reliability: "good" },
    { name: "Subaru Outback", price: 33000, rating: 4.6, fuel: "gas", reliability: "very good" },
    { name: "Ford Maverick", price: 26000, rating: 4.2, fuel: "hybrid", reliability: "good" },
    { name: "Toyota Corolla", price: 24000, rating: 4.3, fuel: "hybrid", reliability: "excellent" },
    { name: "Honda Civic", price: 25000, rating: 4.4, fuel: "gas", reliability: "excellent" },
    { name: "Mazda3", price: 26000, rating: 4.5, fuel: "gas", reliability: "very good" }
  ];

  // Filter cars within reasonable range of target (±20%)
  const minPrice = targetAmount * 0.8;
  const maxPrice = targetAmount * 1.2;
  
  let suitableCars = carDatabase.filter(car => car.price >= minPrice && car.price <= maxPrice);
  
  // If no cars in range, expand range
  if (suitableCars.length === 0) {
    suitableCars = carDatabase.filter(car => car.price <= targetAmount * 1.3);
  }
  
  // Sort by value (rating/price ratio) and take top 4
  suitableCars.sort((a, b) => (b.rating / b.price) - (a.rating / a.price));
  
  return suitableCars.slice(0, 4).map(car => ({
    ...car,
    valueScore: ((car.rating / car.price) * 10000).toFixed(1),
    priceDifference: car.price - targetAmount,
    priceDifferencePercent: ((car.price - targetAmount) / targetAmount * 100).toFixed(1)
  }));
}

/**
 * Complete planning calculation with market data
 */
export async function calculatePlanningDataWithMarket(planningData) {
  const validation = validatePlanningInput(planningData);
  if (!validation.isValid) {
    throw new Error(validation.errors.join(', '));
  }

  const savingsCapacity = calculateSavingsCapacity(
    planningData.monthly_income,
    planningData.fixed_expenses,
    planningData.variable_expenses
  );

  let timeToGoal = null;
  let requiredMonthlySavings = null;
  let feasible = null;

  if (planningData.timeframe_months) {
    // Timeframe provided - calculate required monthly savings
    requiredMonthlySavings = calculateRequiredMonthlySavings(
      planningData.target_amount,
      planningData.current_savings,
      planningData.timeframe_months
    );
    feasible = requiredMonthlySavings <= savingsCapacity;
  } else {
    // No timeframe - calculate time to goal
    timeToGoal = calculateTimeToGoal(
      planningData.target_amount,
      planningData.current_savings,
      savingsCapacity
    );
  }

  const plans = generateSavingPlans(
    savingsCapacity,
    planningData.target_amount,
    planningData.current_savings,
    planningData.timeframe_months
  );

  // Fetch market data and calculate deviations
  const marketData = await fetchMarketData(planningData.goal_type, planningData.target_amount);
  const deviationAnalysis = calculateDeviationAnalysis(planningData.target_amount, marketData);

  const insights = generateInsights(planningData, savingsCapacity, plans);

  return {
    goal_data: planningData,
    savings_capacity: savingsCapacity,
    time_to_goal_months: timeToGoal,
    required_monthly_savings: requiredMonthlySavings,
    feasible,
    plans,
    insights,
    market_data: marketData,
    deviation_analysis: deviationAnalysis,
    calculated_at: new Date().toISOString()
  };
}
