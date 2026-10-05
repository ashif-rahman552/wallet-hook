/**
 * Savings Service
 * Handles goal-based savings with progress tracking and insights
 */

export function newGoalId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `goal_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function newTransactionId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `txn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Calculate savings capacity
 */
export function calculateSavingsCapacity(monthlyIncome, monthlyExpenses) {
  return monthlyIncome - monthlyExpenses;
}

/**
 * Calculate required monthly saving to meet deadline
 */
export function calculateRequiredMonthlySaving(targetAmount, currentSaved, deadlineDate) {
  const remainingAmount = targetAmount - currentSaved;
  if (remainingAmount <= 0) return 0;
  
  const today = new Date();
  const deadline = new Date(deadlineDate);
  const remainingMonths = Math.max(1, Math.ceil((deadline - today) / (1000 * 60 * 60 * 24 * 30)));
  
  return remainingAmount / remainingMonths;
}

/**
 * Estimate time to reach goal (in months)
 */
export function estimateTimeToGoal(targetAmount, currentSaved, monthlySavings) {
  const remainingAmount = targetAmount - currentSaved;
  if (remainingAmount <= 0) return 0;
  if (monthlySavings <= 0) return Infinity;
  return Math.ceil(remainingAmount / monthlySavings);
}

/**
 * Calculate progress percentage
 */
export function calculateProgressPercentage(currentSaved, targetAmount) {
  if (targetAmount <= 0) return 0;
  return Math.min(100, (currentSaved / targetAmount) * 100);
}

/**
 * Generate savings insights
 */
export function generateSavingsInsights(goal, monthlyIncome, monthlyExpenses) {
  const insights = [];
  const suggestions = [];
  
  const savingsCapacity = calculateSavingsCapacity(monthlyIncome, monthlyExpenses);
  const progress = calculateProgressPercentage(goal.current_saved, goal.target_amount);
  const remainingAmount = goal.target_amount - goal.current_saved;
  
  // Progress insights
  if (progress >= 100) {
    insights.push("🎉 Congratulations! You've reached your goal!");
  } else if (progress >= 75) {
    insights.push("🎯 Almost there! You're over 75% complete.");
  } else if (progress >= 50) {
    insights.push("💪 Great progress! You're halfway to your goal.");
  } else if (progress >= 25) {
    insights.push("📈 Good start! Keep up the momentum.");
  } else {
    insights.push("🚀 Every journey begins with a single step!");
  }
  
  // Pace analysis
  if (goal.deadline) {
    const requiredMonthly = calculateRequiredMonthlySaving(
      goal.target_amount, 
      goal.current_saved, 
      goal.deadline
    );
    
    if (savingsCapacity >= requiredMonthly) {
      insights.push("✅ You are on track to meet your deadline!");
    } else {
      const shortfall = requiredMonthly - savingsCapacity;
      suggestions.push(`You need to save ₹${shortfall.toFixed(0)} more per month to meet your goal.`);
      insights.push("⚠️ At current pace, goal will be delayed.");
    }
  } else {
    const estimatedTime = estimateTimeToGoal(
      goal.target_amount,
      goal.current_saved,
      savingsCapacity
    );
    
    if (estimatedTime === Infinity) {
      suggestions.push("Consider reducing expenses or increasing income to start saving.");
    } else if (estimatedTime > 60) {
      suggestions.push("Consider increasing your monthly savings to reach goals faster.");
    } else {
      insights.push(`📅 At current pace, you'll reach your goal in ${estimatedTime} months.`);
    }
  }
  
  // Savings capacity insights
  if (savingsCapacity <= 0) {
    suggestions.push("Your expenses exceed your income. Review your budget immediately.");
  } else if (savingsCapacity < monthlyIncome * 0.1) {
    suggestions.push("Try to save at least 10% of your income for better financial health.");
  }
  
  return {
    insights,
    suggestions,
    progress_percentage: progress.toFixed(1),
    remaining_amount: remainingAmount,
    savings_capacity: savingsCapacity,
    estimated_months: goal.deadline ? null : estimateTimeToGoal(
      goal.target_amount,
      goal.current_saved,
      savingsCapacity
    )
  };
}

/**
 * Create a new savings goal
 */
export function createGoal(goalData) {
  const validation = validateGoalData(goalData);
  if (!validation.isValid) {
    throw new Error(validation.errors.join(', '));
  }
  
  return {
    id: newGoalId(),
    name: goalData.name,
    target_amount: parseFloat(goalData.target_amount) || 0,
    current_saved: parseFloat(goalData.current_saved) || 0,
    deadline: goalData.deadline || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: 'active'
  };
}

/**
 * Validate goal data
 */
export function validateGoalData(data) {
  const errors = [];
  
  if (!data.name || data.name.trim().length < 2) {
    errors.push('Goal name must be at least 2 characters');
  }
  
  if (!data.target_amount || data.target_amount <= 0) {
    errors.push('Target amount must be greater than 0');
  }
  
  if (data.current_saved < 0) {
    errors.push('Current saved amount cannot be negative');
  }
  
  if (data.deadline) {
    const deadline = new Date(data.deadline);
    const today = new Date();
    if (deadline <= today) {
      errors.push('Deadline must be in the future');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Add savings to a goal with automatic completion detection
 */
export function addSavingsToGoal(goal, amount, date = new Date().toISOString()) {
  if (amount <= 0) {
    throw new Error('Savings amount must be greater than 0');
  }
  
  const transaction = {
    id: newTransactionId(),
    goal_id: goal.id,
    amount: parseFloat(amount),
    date: date,
    type: 'deposit',
    created_at: new Date().toISOString()
  };
  
  const newCurrentSaved = goal.current_saved + amount;
  const isCompleted = newCurrentSaved >= goal.target_amount;
  
  const updatedGoal = {
    ...goal,
    current_saved: newCurrentSaved,
    updated_at: new Date().toISOString(),
    status: isCompleted ? 'completed' : 'active',
    completed_at: isCompleted ? new Date().toISOString() : (goal.completed_at || null)
  };
  
  // Create completion log if goal was just completed
  let completionLog = null;
  if (isCompleted && goal.status !== 'completed') {
    completionLog = {
      id: newTransactionId(),
      goal_id: goal.id,
      goal_name: goal.name,
      target_amount: goal.target_amount,
      final_saved: newCurrentSaved,
      completion_date: new Date().toISOString(),
      created_at: new Date().toISOString(),
      type: 'goal_completion'
    };
  }
  
  return {
    transaction,
    updated_goal: updatedGoal,
    completion_log: completionLog,
    was_just_completed: isCompleted && goal.status !== 'completed'
  };
}

/**
 * Get completed goals history
 */
export function getCompletedGoals(goals = [], transactions = []) {
  const completedGoals = goals.filter(goal => goal.status === 'completed');
  
  return completedGoals.map(goal => {
    const goalTransactions = transactions.filter(t => t.goal_id === goal.id);
    const totalSaved = goalTransactions.reduce((sum, t) => sum + t.amount, 0);
    
    return {
      ...goal,
      transaction_count: goalTransactions.length,
      total_saved: totalSaved,
      completion_date: goal.completed_at,
      days_to_complete: calculateDaysToComplete(goal.created_at, goal.completed_at)
    };
  });
}

/**
 * Calculate days taken to complete goal
 */
export function calculateDaysToComplete(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Delete a goal (only if completed)
 */
export function deleteGoal(goal, transactions = []) {
  if (goal.status !== 'completed') {
    throw new Error('Only completed goals can be deleted');
  }
  
  const goalTransactions = transactions.filter(t => t.goal_id === goal.id);
  
  return {
    deleted_goal: {
      ...goal,
      deleted_at: new Date().toISOString(),
      status: 'deleted'
    },
    archived_transactions: goalTransactions.map(t => ({
      ...t,
      archived_at: new Date().toISOString(),
      goal_deleted: true
    }))
  };
}

/**
 * Get goal statistics
 */
export function getGoalStatistics(goals = [], transactions = []) {
  const totalGoals = goals.length;
  const activeGoals = goals.filter(g => g.status === 'active').length;
  const completedGoals = goals.filter(g => g.status === 'completed').length;
  const totalSaved = goals.reduce((sum, goal) => sum + goal.current_saved, 0);
  const totalTarget = goals.reduce((sum, goal) => sum + goal.target_amount, 0);
  const overallProgress = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;
  
  // Find most recent completion
  const completedGoalsData = getCompletedGoals(goals, transactions);
  const mostRecentCompletion = completedGoalsData.length > 0 
    ? completedGoalsData.reduce((latest, current) => 
        new Date(current.completion_date) > new Date(latest.completion_date) ? current : latest
      )
    : null;
  
  return {
    total_goals: totalGoals,
    active_goals: activeGoals,
    completed_goals: completedGoals,
    total_saved: totalSaved,
    total_target: totalTarget,
    overall_progress: overallProgress.toFixed(1),
    most_recent_completion: mostRecentCompletion,
    completion_rate: totalGoals > 0 ? ((completedGoals / totalGoals) * 100).toFixed(1) : 0
  };
}

/**
 * Get goal progress summary
 */
export function getGoalProgress(goal, transactions = []) {
  const goalTransactions = transactions.filter(t => t.goal_id === goal.id);
  const totalSaved = goalTransactions.reduce((sum, t) => sum + t.amount, 0);
  const progress = calculateProgressPercentage(totalSaved, goal.target_amount);
  const remaining = goal.target_amount - totalSaved;
  
  return {
    goal_id: goal.id,
    goal_name: goal.name,
    target_amount: goal.target_amount,
    current_saved: totalSaved,
    progress_percentage: progress,
    remaining_amount: remaining,
    status: remaining <= 0 ? 'completed' : 'active',
    deadline: goal.deadline,
    created_at: goal.created_at,
    transaction_count: goalTransactions.length
  };
}

/**
 * Suggest monthly savings amount
 */
export function suggestMonthlySavings(monthlyIncome, monthlyExpenses, goals = []) {
  const savingsCapacity = calculateSavingsCapacity(monthlyIncome, monthlyExpenses);
  
  if (savingsCapacity <= 0) {
    return {
      suggested_amount: 0,
      message: "No savings capacity available. Consider reducing expenses.",
      feasibility: "not_feasible"
    };
  }
  
  // Calculate total required monthly for all active goals
  const totalRequiredMonthly = goals.reduce((sum, goal) => {
    if (goal.status === 'completed') return sum;
    
    if (goal.deadline) {
      const required = calculateRequiredMonthlySaving(
        goal.target_amount,
        goal.current_saved,
        goal.deadline
      );
      return sum + required;
    }
    return sum;
  }, 0);
  
  let suggestedAmount;
  let feasibility;
  let message;
  
  if (totalRequiredMonthly <= savingsCapacity) {
    suggestedAmount = totalRequiredMonthly;
    feasibility = "feasible";
    message = "You can comfortably meet all your goals!";
  } else {
    suggestedAmount = savingsCapacity * 0.8; // Suggest 80% of capacity
    feasibility = "challenging";
    message = `Goals are ambitious. Consider extending deadlines or reducing targets.`;
  }
  
  return {
    suggested_amount: suggestedAmount,
    total_required: totalRequiredMonthly,
    savings_capacity: savingsCapacity,
    feasibility,
    message,
    goal_breakdown: goals.map(goal => ({
      goal_name: goal.name,
      required_monthly: goal.deadline ? calculateRequiredMonthlySaving(
        goal.target_amount,
        goal.current_saved,
        goal.deadline
      ) : null
    }))
  };
}
