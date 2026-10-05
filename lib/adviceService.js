/**
 * Financial Advice Service
 * Generates personalized financial advice based on user data from budgeting, planning, and savings
 */

/**
 * Core financial advice categories with animations and emojis
 */
export const ADVICE_CATEGORIES = {
  BUDGET: 'budget',
  SAVINGS: 'savings',
  INVESTMENT: 'investment',
  DEBT: 'debt',
  GOALS: 'goals'
};

/**
 * Generate personalized advice based on comprehensive user data
 */
export function generatePersonalizedAdvice(userData) {
  const { budgetData, planningGoals, savingsGoals, transactions } = userData;
  
  const advices = [];
  
  // Budget-based advice
  if (budgetData) {
    advices.push(...generateBudgetAdvice(budgetData));
  }
  
  // Savings-based advice
  if (savingsGoals && savingsGoals.length > 0) {
    advices.push(...generateSavingsAdvice(savingsGoals));
  }
  
  // Planning-based advice
  if (planningGoals && planningGoals.length > 0) {
    advices.push(...generatePlanningAdvice(planningGoals));
  }
  
  // Overall financial health advice
  advices.push(...generateFinancialHealthAdvice(userData));
  
  // Sort by priority and relevance
  return advices.sort((a, b) => (b.priority - a.priority)).slice(0, 3);
}

/**
 * Generate budget-related advice
 */
function generateBudgetAdvice(budgetData) {
  const advices = [];
  const { balance, pctOfIncome } = budgetData;
  
  if (balance < 0) {
    advices.push({
      id: `budget_${Date.now()}_1`,
      category: ADVICE_CATEGORIES.BUDGET,
      title: "🚨 Budget Alert",
      message: "Your expenses exceed your income! Immediate action required.",
      detailedAdvice: "Review your largest expenses first. Consider reducing subscriptions, dining out, or entertainment costs by 20%.",
      priority: 1,
      emoji: "🚨",
      animation: "pulse",
      color: "#f44336"
    });
  } else if (pctOfIncome >= 30) {
    advices.push({
      id: `budget_${Date.now()}_2`,
      category: ADVICE_CATEGORIES.BUDGET,
      title: "🎉 Excellent Savings",
      message: "You're saving over 30% of your income!",
      detailedAdvice: "Consider investing excess savings in low-risk index funds or high-yield savings accounts for better returns.",
      priority: 2,
      emoji: "🎉",
      animation: "bounce",
      color: "#4caf50"
    });
  } else if (pctOfIncome >= 10) {
    advices.push({
      id: `budget_${Date.now()}_3`,
      category: ADVICE_CATEGORIES.BUDGET,
      title: "💪 Good Progress",
      message: "You're maintaining a healthy savings rate of 10-30%.",
      detailedAdvice: "Keep tracking expenses and look for opportunities to increase savings by 5-10% for faster goal achievement.",
      priority: 3,
      emoji: "💪",
      animation: "slideIn",
      color: "#2196f3"
    });
  } else {
    advices.push({
      id: `budget_${Date.now()}_4`,
      category: ADVICE_CATEGORIES.BUDGET,
      title: "📈 Savings Opportunity",
      message: "Your savings rate is below 10%. Let's improve this!",
      detailedAdvice: "Try the 50/30/20 rule: 50% needs, 30% wants, 20% savings. Automate savings transfers for consistency.",
      priority: 2,
      emoji: "📈",
      animation: "shake",
      color: "#ff9800"
    });
  }
  
  return advices;
}

/**
 * Generate savings-related advice
 */
function generateSavingsAdvice(savingsGoals) {
  const advices = [];
  const activeGoals = savingsGoals.filter(g => g.status === 'active');
  const completedGoals = savingsGoals.filter(g => g.status === 'completed');
  
  if (activeGoals.length === 0 && completedGoals.length > 0) {
    advices.push({
      id: `savings_${Date.now()}_1`,
      category: ADVICE_CATEGORIES.SAVINGS,
      title: "🏆 Goal Achievement Master",
      message: "Congratulations on completing your goals!",
      detailedAdvice: "Set new challenging goals and consider increasing target amounts by 15-25% to continue growing. Track progress weekly.",
      priority: 2,
      emoji: "🏆",
      animation: "celebrate",
      color: "#4caf50"
    });
  } else if (activeGoals.length > 3) {
    advices.push({
      id: `savings_${Date.now()}_2`,
      category: ADVICE_CATEGORIES.SAVINGS,
      title: "🎯 Goal Focus",
      message: "You have many active goals. Consider prioritizing!",
      detailedAdvice: "Focus on 1-2 high-priority goals first. Complete them before starting new ones for better success rate.",
      priority: 3,
      emoji: "🎯",
      animation: "pulse",
      color: "#ff5722"
    });
  } else {
    const avgProgress = activeGoals.reduce((sum, g) => sum + (g.current_saved / g.target_amount * 100), 0) / activeGoals.length;
    
    if (avgProgress > 50) {
      advices.push({
        id: `savings_${Date.now()}_3`,
        category: ADVICE_CATEGORIES.SAVINGS,
        title: "🚀 Halfway There",
        message: "Your average goal progress is over 50%!",
        detailedAdvice: "You're doing great! Consider increasing monthly contributions or setting shorter deadlines to maintain momentum.",
        priority: 2,
        emoji: "🚀",
        animation: "bounce",
        color: "#2196f3"
      });
    } else {
      advices.push({
        id: `savings_${Date.now()}_4`,
        category: ADVICE_CATEGORIES.SAVINGS,
        title: "💡 Consistency Key",
        message: "Small consistent savings beat large inconsistent ones.",
        detailedAdvice: "Automate weekly savings transfers. Start with even ₹100-500 weekly and increase by 10% each month.",
        priority: 2,
        emoji: "💡",
        animation: "slideIn",
        color: "#ff9800"
      });
    }
  }
  
  return advices;
}

/**
 * Generate planning-related advice
 */
function generatePlanningAdvice(planningGoals) {
  const advices = [];
  
  if (planningGoals.length === 0) {
    advices.push({
      id: `planning_${Date.now()}_1`,
      category: ADVICE_CATEGORIES.GOALS,
      title: "🎯 Start Planning",
      message: "Create your first financial goal!",
      detailedAdvice: "Begin with a 3-6 month emergency fund goal (3-6 months of expenses). Then plan for larger goals like vacations or major purchases.",
      priority: 1,
      emoji: "🎯",
      animation: "pulse",
      color: "#9c27b0"
    });
  } else {
    const recentPlans = planningGoals.slice(-3); // Last 3 plans
    const avgTimeframe = recentPlans.reduce((sum, p) => {
      const timeframe = p.timeframe_months || (p.time_to_goal_months || 12);
      return sum + timeframe;
    }, 0) / recentPlans.length;
    
    if (avgTimeframe > 24) {
      advices.push({
        id: `planning_${Date.now()}_2`,
        category: ADVICE_CATEGORIES.GOALS,
        title: "⏰ Long-term Planner",
        message: "You're planning for the long term!",
        detailedAdvice: "Break large goals into smaller milestones. Celebrate each milestone to stay motivated. Review progress quarterly.",
        priority: 2,
        emoji: "⏰",
        animation: "rotate",
        color: "#673ab7"
      });
    } else {
      advices.push({
        id: `planning_${Date.now()}_3`,
        category: ADVICE_CATEGORIES.GOALS,
        title: "📋 Strategic Planner",
        message: "Your planning timeline is well-balanced!",
        detailedAdvice: "Consider setting up automatic transfers to savings accounts for each goal. Review and adjust plans quarterly based on progress.",
        priority: 2,
        emoji: "📋",
        animation: "slideIn",
        color: "#4caf50"
      });
    }
  }
  
  return advices;
}

/**
 * Generate overall financial health advice
 */
function generateFinancialHealthAdvice(userData) {
  const advices = [];
  const { budgetData, savingsGoals, planningGoals } = userData;
  
  // Calculate overall financial health score
  let healthScore = 50; // Base score
  let healthFactors = [];
  
  if (budgetData) {
    if (budgetData.balance > 0) {
      healthScore += 20;
      healthFactors.push("Positive budget balance");
    }
    if (budgetData.pctOfIncome >= 20) {
      healthScore += 15;
      healthFactors.push("Good savings rate");
    }
  }
  
  if (savingsGoals) {
    const completionRate = savingsGoals.filter(g => g.status === 'completed').length / savingsGoals.length;
    if (completionRate > 0.5) {
      healthScore += 15;
      healthFactors.push("High goal completion rate");
    }
  }
  
  if (planningGoals && planningGoals.length > 0) {
    healthScore += 10;
    healthFactors.push("Active financial planning");
  }
  
  // Generate advice based on health score
  if (healthScore >= 80) {
    advices.push({
      id: `health_${Date.now()}_1`,
      category: ADVICE_CATEGORIES.INVESTMENT,
      title: "🌟 Financial Wellness",
      message: "Your financial health is excellent!",
      detailedAdvice: `Strong factors: ${healthFactors.join(', ')}. Consider diversifying investments and exploring retirement planning options.`,
      priority: 3,
      emoji: "🌟",
      animation: "sparkle",
      color: "#4caf50"
    });
  } else if (healthScore >= 60) {
    advices.push({
      id: `health_${Date.now()}_2`,
      category: ADVICE_CATEGORIES.INVESTMENT,
      title: "📈 Growing Strong",
      message: "Your financial health is good!",
      detailedAdvice: `Building on: ${healthFactors.join(', ')}. Focus on increasing emergency fund to 6 months of expenses.`,
      priority: 2,
      emoji: "📈",
      animation: "grow",
      color: "#2196f3"
    });
  } else {
    advices.push({
      id: `health_${Date.now()}_3`,
      category: ADVICE_CATEGORIES.DEBT,
      title: "🔧 Foundation Building",
      message: "Let's strengthen your financial foundation!",
      detailedAdvice: `Areas to improve: ${healthFactors.join(', ')}. Start with budget tracking and consistent savings habits.`,
      priority: 1,
      emoji: "🔧",
      animation: "build",
      color: "#ff9800"
    });
  }
  
  return advices;
}

/**
 * Get motivational messages based on time of day
 */
export function getMotivationalMessage() {
  const hour = new Date().getHours();
  
  if (hour >= 5 && hour < 9) {
    return {
      message: "🌅 Early bird gets the worm! Start your day with financial planning.",
      emoji: "🌅"
    };
  } else if (hour >= 9 && hour < 12) {
    return {
      message: "☀ Mid-morning review! Check your progress and plan your day.",
      emoji: "☀"
    };
  } else if (hour >= 12 && hour < 17) {
    return {
      message: "🌞 Afternoon check-in! Time to review expenses and progress.",
      emoji: "🌞"
    };
  } else if (hour >= 17 && hour < 21) {
    return {
      message: "🌆 Evening wrap-up! Review today's financial decisions and plan tomorrow.",
      emoji: "🌆"
    };
  } else {
    return {
      message: "🌙 Night owl! Late-night planning for tomorrow's success.",
      emoji: "🌙"
    };
  }
}

/**
 * Calculate financial health score
 */
export function calculateFinancialHealthScore(userData) {
  const { budgetData, savingsGoals, planningGoals } = userData;
  let score = 50; // Base score
  
  if (budgetData) {
    if (budgetData.balance > 0) score += 20;
    if (budgetData.pctOfIncome >= 20) score += 15;
    if (budgetData.pctOfIncome >= 10) score += 10;
  }
  
  if (savingsGoals) {
    const completionRate = savingsGoals.filter(g => g.status === 'completed').length / savingsGoals.length;
    if (completionRate > 0.5) score += 15;
    if (completionRate > 0.3) score += 10;
  }
  
  if (planningGoals && planningGoals.length > 0) score += 10;
  
  return Math.min(100, score);
}

/**
 * Get health score color and label
 */
export function getHealthScoreDisplay(score) {
  if (score >= 80) {
    return { color: '#4caf50', label: 'Excellent', emoji: '🌟' };
  } else if (score >= 60) {
    return { color: '#2196f3', label: 'Good', emoji: '📈' };
  } else if (score >= 40) {
    return { color: '#ff9800', label: 'Fair', emoji: '📊' };
  } else {
    return { color: '#f44336', label: 'Needs Work', emoji: '🔧' };
  }
}
