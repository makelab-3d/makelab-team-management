-- Migration: Add tracks_hours column to employees
-- Run this in your Supabase SQL editor
-- Controls whether an employee appears in pay period reminders and missing-hours lists

ALTER TABLE employees ADD COLUMN IF NOT EXISTS tracks_hours BOOLEAN NOT NULL DEFAULT true;
