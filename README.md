# agent-orchestrator

## Purpose

This agent coordinates the execution flow across all other agents in 
the investment automation system.  
Its role is to act as a dispatcher, scheduler, and state tracker 
ensuring coherent interaction between data sources, planners, 
executors, and reviewers.

## Responsibilities

- Maintain a registry of available agents and their capabilities  
- Dispatch execution commands based on defined workflows or triggers  
- Monitor the status of running or queued operations  
- Manage inter-agent communication and dependency resolution  
- Provide auditability and centralized status visibility

## Inputs

- Configurations for agent execution order and timing  
- Signals or triggers from agent-news, agent-trade, or manual input  
- State snapshots and reports from all registered agents

## Outputs

- Dispatch logs with timestamps and results  
- System-level error reports or coordination failures  
- Current operational status of each agent  
- Notifications or feedback loops to planner/reviewer systems

## Update Triggers

- Scheduled workflows or cron-style timers  
- Event-based signals from upstream agents  
- Manual activation or override from the user

## Design Principles

- Stateless coordination when possible  
- Modular integration of agents without embedding their logic  
- Fallback-safe: no single-agent failure should halt the system  
- Human-readable logs and traceable activity flow

## Integration

- Oversees all active modules including agent-news, agent-trade, agent-portfolio, etc.  
- Updates investor-index with coordination status  
- Supports agent-reviewer with execution histories  
- Enables planner-reviewer-executor loops via structured control

## Status

This document defines the operational and planning scope for `agent-orchestrator`.  
No separate PRD is required.
