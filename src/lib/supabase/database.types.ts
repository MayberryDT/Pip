export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  private: {
    CompositeTypes: Record<string, never>;
    Enums: Record<string, never>;
    Tables: {
      provider_credentials: {
        Row: {
          institution_id: string;
          user_id: string;
          provider: Database["public"]["Enums"]["financial_provider"];
          teller_enrollment_id: string | null;
          plaid_item_id: string | null;
          access_token_ciphertext: string | null;
          refresh_token_ciphertext: string | null;
          certificate_ref: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          institution_id: string;
          user_id: string;
          provider: Database["public"]["Enums"]["financial_provider"];
          teller_enrollment_id?: string | null;
          plaid_item_id?: string | null;
          access_token_ciphertext?: string | null;
          refresh_token_ciphertext?: string | null;
          certificate_ref?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          teller_enrollment_id?: string | null;
          plaid_item_id?: string | null;
          access_token_ciphertext?: string | null;
          refresh_token_ciphertext?: string | null;
          certificate_ref?: string | null;
          metadata?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
  public: {
    CompositeTypes: Record<string, never>;
    Enums: {
      account_kind: "checking" | "savings" | "credit_card" | "loan" | "other";
      transaction_kind:
        | "income"
        | "purchase"
        | "rent"
        | "credit_card_payment"
        | "transfer"
        | "refund"
        | "fee"
        | "unknown";
      financial_provider: "mock" | "teller" | "plaid";
      connection_status: "connected" | "mocked" | "stale" | "failed" | "revoked";
      recurring_obligation_rule_source: "user_confirmed" | "user_correction" | "auto_detected";
      recurring_obligation_rule_status: "active" | "ignored";
      sync_status: "started" | "succeeded" | "failed" | "partial";
      plaid_webhook_verification_status: "verified" | "bypassed_dev" | "failed";
      plaid_webhook_processing_status: "received" | "ignored" | "enqueued" | "failed";
      pip_sync_job_reason:
        | "plaid_webhook"
        | "scheduled"
        | "app_open"
        | "manual"
        | "repair"
        | "account_selection"
        | "settings_change"
        | "account_change";
      pip_sync_job_status: "pending" | "running" | "succeeded" | "failed" | "skipped";
      pip_reaction_trigger:
        | "plaid_webhook"
        | "scheduled_sync"
        | "app_open_refresh"
        | "manual_refresh"
        | "account_change"
        | "settings_change"
        | "repair"
        | "account_selection";
      pip_reaction_type:
        | "small_lift"
        | "big_lift"
        | "small_drop"
        | "big_drop"
        | "shortfall"
        | "recovered"
        | "data_issue"
        | "connection_repaired"
        | "cash_tight"
        | "low_confidence";
      savings_goal_status: "active" | "paused" | "completed" | "archived";
    };
    Tables: {
      user_settings: {
        Row: {
          user_id: string;
          protected_savings_monthly_cents: number;
          manual_refresh_only: boolean;
          invite_accepted_at: string | null;
          privacy_consent_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          protected_savings_monthly_cents?: number;
          manual_refresh_only?: boolean;
          invite_accepted_at?: string | null;
          privacy_consent_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          protected_savings_monthly_cents?: number;
          manual_refresh_only?: boolean;
          invite_accepted_at?: string | null;
          privacy_consent_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      agent_model_gate_windows: {
        Row: {
          id: string;
          scope_hash: string;
          request_kind: string;
          window_kind: string;
          window_start: string;
          request_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          scope_hash: string;
          request_kind: string;
          window_kind: string;
          window_start: string;
          request_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          scope_hash?: string;
          request_kind?: string;
          window_kind?: string;
          window_start?: string;
          request_count?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      agent_model_gate_leases: {
        Row: {
          id: string;
          scope_hash: string;
          request_kind: string;
          acquired_at: string;
          expires_at: string;
          released_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          scope_hash: string;
          request_kind: string;
          acquired_at?: string;
          expires_at: string;
          released_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          scope_hash?: string;
          request_kind?: string;
          acquired_at?: string;
          expires_at?: string;
          released_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      connected_institutions: {
        Row: {
          id: string;
          user_id: string;
          provider: Database["public"]["Enums"]["financial_provider"];
          institution_name: string;
          provider_institution_id: string | null;
          status: Database["public"]["Enums"]["connection_status"];
          last_successful_sync_at: string | null;
          stale_after: string | null;
          error_code: string | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          provider: Database["public"]["Enums"]["financial_provider"];
          institution_name: string;
          provider_institution_id?: string | null;
          status?: Database["public"]["Enums"]["connection_status"];
          last_successful_sync_at?: string | null;
          stale_after?: string | null;
          error_code?: string | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          institution_name?: string;
          provider_institution_id?: string | null;
          status?: Database["public"]["Enums"]["connection_status"];
          last_successful_sync_at?: string | null;
          stale_after?: string | null;
          error_code?: string | null;
          error_message?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      accounts: {
        Row: {
          id: string;
          user_id: string;
          institution_id: string | null;
          provider_account_id: string;
          name: string;
          institution_name: string;
          kind: Database["public"]["Enums"]["account_kind"];
          balance_cents: number;
          available_balance_cents: number | null;
          last_four: string | null;
          is_protected_savings: boolean;
          active: boolean;
          raw_provider_data: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          institution_id?: string | null;
          provider_account_id: string;
          name: string;
          institution_name: string;
          kind: Database["public"]["Enums"]["account_kind"];
          balance_cents: number;
          available_balance_cents?: number | null;
          last_four?: string | null;
          is_protected_savings?: boolean;
          active?: boolean;
          raw_provider_data?: Json;
        };
        Update: {
          name?: string;
          institution_name?: string;
          kind?: Database["public"]["Enums"]["account_kind"];
          balance_cents?: number;
          available_balance_cents?: number | null;
          last_four?: string | null;
          is_protected_savings?: boolean;
          active?: boolean;
          raw_provider_data?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      account_preferences: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          include_in_pip_cash: boolean;
          is_protected_savings_override: boolean | null;
          user_label: string | null;
          hidden_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          account_id: string;
          include_in_pip_cash?: boolean;
          is_protected_savings_override?: boolean | null;
          user_label?: string | null;
          hidden_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          include_in_pip_cash?: boolean;
          is_protected_savings_override?: boolean | null;
          user_label?: string | null;
          hidden_reason?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      savings_goals: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          target_amount_cents: number;
          target_date: string | null;
          starting_amount_cents: number;
          current_amount_cents: number;
          monthly_contribution_cents: number;
          include_in_spendable_cash: boolean;
          status: Database["public"]["Enums"]["savings_goal_status"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          target_amount_cents: number;
          target_date?: string | null;
          starting_amount_cents?: number;
          current_amount_cents?: number;
          monthly_contribution_cents?: number;
          include_in_spendable_cash?: boolean;
          status?: Database["public"]["Enums"]["savings_goal_status"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          target_amount_cents?: number;
          target_date?: string | null;
          starting_amount_cents?: number;
          current_amount_cents?: number;
          monthly_contribution_cents?: number;
          include_in_spendable_cash?: boolean;
          status?: Database["public"]["Enums"]["savings_goal_status"];
          updated_at?: string;
        };
        Relationships: [];
      };
      recurring_obligation_rules: {
        Row: {
          id: string;
          user_id: string;
          merchant_key: string;
          label: string;
          expected_amount_cents: number;
          expected_day: number | null;
          cadence: "monthly";
          source: Database["public"]["Enums"]["recurring_obligation_rule_source"];
          status: Database["public"]["Enums"]["recurring_obligation_rule_status"];
          last_confirmed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          merchant_key: string;
          label: string;
          expected_amount_cents: number;
          expected_day?: number | null;
          cadence?: "monthly";
          source: Database["public"]["Enums"]["recurring_obligation_rule_source"];
          status?: Database["public"]["Enums"]["recurring_obligation_rule_status"];
          last_confirmed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          merchant_key?: string;
          label?: string;
          expected_amount_cents?: number;
          expected_day?: number | null;
          cadence?: "monthly";
          source?: Database["public"]["Enums"]["recurring_obligation_rule_source"];
          status?: Database["public"]["Enums"]["recurring_obligation_rule_status"];
          last_confirmed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          provider_transaction_id: string;
          date: string;
          description: string;
          merchant_name: string | null;
          amount_cents: number;
          category: string | null;
          kind: Database["public"]["Enums"]["transaction_kind"] | null;
          pending: boolean;
          metadata: Json;
          raw_provider_data: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          account_id: string;
          provider_transaction_id: string;
          date: string;
          description: string;
          merchant_name?: string | null;
          amount_cents: number;
          category?: string | null;
          kind?: Database["public"]["Enums"]["transaction_kind"] | null;
          pending?: boolean;
          metadata?: Json;
          raw_provider_data?: Json;
        };
        Update: {
          date?: string;
          description?: string;
          merchant_name?: string | null;
          amount_cents?: number;
          category?: string | null;
          kind?: Database["public"]["Enums"]["transaction_kind"] | null;
          pending?: boolean;
          metadata?: Json;
          raw_provider_data?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      pip_cash_snapshots: {
        Row: {
          id: string;
          user_id: string;
          as_of_date: string;
          pip_cash_today_cents: number;
          rolling_net_cents: number;
          income_total_cents: number;
          spending_total_cents: number;
          refund_total_cents: number;
          protected_savings_monthly_cents: number;
          result: Json;
          stale: boolean;
          source_sync_run_id: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          as_of_date: string;
          pip_cash_today_cents: number;
          rolling_net_cents: number;
          income_total_cents: number;
          spending_total_cents: number;
          refund_total_cents: number;
          protected_savings_monthly_cents: number;
          result: Json;
          stale?: boolean;
          source_sync_run_id?: string | null;
        };
        Update: {
          stale?: boolean;
        };
        Relationships: [];
      };
      sync_runs: {
        Row: {
          id: string;
          user_id: string;
          institution_id: string | null;
          provider: Database["public"]["Enums"]["financial_provider"];
          status: Database["public"]["Enums"]["sync_status"];
          started_at: string;
          completed_at: string | null;
          duration_ms: number | null;
          account_count: number;
          transaction_count: number;
          balance_count: number;
          error_code: string | null;
          error_message: string | null;
        };
        Insert: {
          user_id: string;
          institution_id?: string | null;
          provider: Database["public"]["Enums"]["financial_provider"];
          status?: Database["public"]["Enums"]["sync_status"];
        };
        Update: {
          institution_id?: string | null;
          status?: Database["public"]["Enums"]["sync_status"];
          completed_at?: string | null;
          duration_ms?: number | null;
          account_count?: number;
          transaction_count?: number;
          balance_count?: number;
          error_code?: string | null;
          error_message?: string | null;
        };
        Relationships: [];
      };
      plaid_webhook_events: {
        Row: {
          id: string;
          user_id: string | null;
          item_id: string | null;
          webhook_type: string;
          webhook_code: string;
          environment: string | null;
          payload: Json;
          body_sha256: string | null;
          verification_status: Database["public"]["Enums"]["plaid_webhook_verification_status"];
          processing_status: Database["public"]["Enums"]["plaid_webhook_processing_status"];
          source_sync_job_id: string | null;
          received_at: string;
          processed_at: string | null;
          error_message: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          item_id?: string | null;
          webhook_type: string;
          webhook_code: string;
          environment?: string | null;
          payload: Json;
          body_sha256?: string | null;
          verification_status?: Database["public"]["Enums"]["plaid_webhook_verification_status"];
          processing_status?: Database["public"]["Enums"]["plaid_webhook_processing_status"];
          source_sync_job_id?: string | null;
          received_at?: string;
          processed_at?: string | null;
          error_message?: string | null;
        };
        Update: {
          user_id?: string | null;
          item_id?: string | null;
          webhook_type?: string;
          webhook_code?: string;
          environment?: string | null;
          payload?: Json;
          body_sha256?: string | null;
          verification_status?: Database["public"]["Enums"]["plaid_webhook_verification_status"];
          processing_status?: Database["public"]["Enums"]["plaid_webhook_processing_status"];
          source_sync_job_id?: string | null;
          processed_at?: string | null;
          error_message?: string | null;
        };
        Relationships: [];
      };
      pip_sync_jobs: {
        Row: {
          id: string;
          user_id: string;
          provider: Database["public"]["Enums"]["financial_provider"];
          institution_id: string | null;
          reason: Database["public"]["Enums"]["pip_sync_job_reason"];
          status: Database["public"]["Enums"]["pip_sync_job_status"];
          source_webhook_event_id: string | null;
          attempts: number;
          max_attempts: number;
          priority: number;
          dedupe_key: string | null;
          available_at: string;
          started_at: string | null;
          completed_at: string | null;
          account_count: number;
          transaction_count: number;
          balance_count: number;
          created_reaction_type: Database["public"]["Enums"]["pip_reaction_type"] | null;
          last_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: Database["public"]["Enums"]["financial_provider"];
          institution_id?: string | null;
          reason: Database["public"]["Enums"]["pip_sync_job_reason"];
          status?: Database["public"]["Enums"]["pip_sync_job_status"];
          source_webhook_event_id?: string | null;
          attempts?: number;
          max_attempts?: number;
          priority?: number;
          dedupe_key?: string | null;
          available_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
          account_count?: number;
          transaction_count?: number;
          balance_count?: number;
          created_reaction_type?: Database["public"]["Enums"]["pip_reaction_type"] | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: Database["public"]["Enums"]["pip_sync_job_status"];
          attempts?: number;
          max_attempts?: number;
          priority?: number;
          dedupe_key?: string | null;
          available_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
          account_count?: number;
          transaction_count?: number;
          balance_count?: number;
          created_reaction_type?: Database["public"]["Enums"]["pip_reaction_type"] | null;
          last_error?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      pip_reaction_events: {
        Row: {
          id: string;
          user_id: string;
          previous_snapshot_id: string | null;
          current_snapshot_id: string | null;
          previous_state: string | null;
          current_state: string;
          spendable_delta_cents: number;
          behavior_adjustment_delta_cents: number;
          shortfall_delta_cents: number;
          cash_reality_adjustment_delta_cents: number;
          confidence_change: string | null;
          trigger: Database["public"]["Enums"]["pip_reaction_trigger"];
          reaction_type: Database["public"]["Enums"]["pip_reaction_type"];
          intensity: number;
          summary: string | null;
          seen_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          previous_snapshot_id?: string | null;
          current_snapshot_id?: string | null;
          previous_state?: string | null;
          current_state: string;
          spendable_delta_cents?: number;
          behavior_adjustment_delta_cents?: number;
          shortfall_delta_cents?: number;
          cash_reality_adjustment_delta_cents?: number;
          confidence_change?: string | null;
          trigger: Database["public"]["Enums"]["pip_reaction_trigger"];
          reaction_type: Database["public"]["Enums"]["pip_reaction_type"];
          intensity: number;
          summary?: string | null;
          seen_at?: string | null;
          created_at?: string;
        };
        Update: {
          seen_at?: string | null;
        };
        Relationships: [];
      };
      beta_invites: {
        Row: {
          id: string;
          email: string;
          invited_at: string;
          accepted_by_user_id: string | null;
          accepted_at: string | null;
        };
        Insert: {
          id?: string;
          email: string;
          invited_at?: string;
          accepted_by_user_id?: string | null;
          accepted_at?: string | null;
        };
        Update: {
          email?: string;
          invited_at?: string;
          accepted_by_user_id?: string | null;
          accepted_at?: string | null;
        };
        Relationships: [];
      };
      data_deletion_requests: {
        Row: {
          id: string;
          user_id: string;
          requested_at: string;
          completed_at: string | null;
          status: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          requested_at?: string;
          completed_at?: string | null;
          status?: string;
        };
        Update: {
          completed_at?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      missing_card_preferences: {
        Row: {
          id: string;
          user_id: string;
          issuer_name: string;
          suppressed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          issuer_name: string;
          suppressed_at?: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      product_events: {
        Row: {
          id: string;
          user_id: string;
          event_name: string;
          properties: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          event_name: string;
          properties?: Json;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      marketing_waitlist: {
        Row: {
          id: string;
          normalized_email: string;
          display_email: string;
          source_page: string;
          referrer: string | null;
          utm_source: string | null;
          utm_medium: string | null;
          utm_campaign: string | null;
          consent_text_version: string;
          status: string;
          created_at: string;
          last_submitted_at: string;
        };
        Insert: {
          id?: string;
          normalized_email: string;
          display_email: string;
          source_page: string;
          referrer?: string | null;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          consent_text_version: string;
          status?: string;
          created_at?: string;
          last_submitted_at?: string;
        };
        Update: {
          display_email?: string;
          source_page?: string;
          referrer?: string | null;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          consent_text_version?: string;
          status?: string;
          last_submitted_at?: string;
        };
        Relationships: [];
      };
      marketing_events: {
        Row: {
          id: string;
          event_name: string;
          properties: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_name: string;
          properties?: Json;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      marketing_content_drafts: {
        Row: {
          id: string;
          source: string;
          slug: string | null;
          title: string | null;
          payload: Json;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          source: string;
          slug?: string | null;
          title?: string | null;
          payload?: Json;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          slug?: string | null;
          title?: string | null;
          payload?: Json;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agent_chat_turns: {
        Row: {
          id: string;
          user_id: string | null;
          conversation_id: string;
          user_message: string;
          assistant_message: string | null;
          error_message: string | null;
          response_mode: string | null;
          used_tools: string[];
          card_types: string[];
          prompt_chips: Json;
          client_action: string | null;
          model: string | null;
          transport: string | null;
          request_metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          conversation_id: string;
          user_message: string;
          assistant_message?: string | null;
          error_message?: string | null;
          response_mode?: string | null;
          used_tools?: string[];
          card_types?: string[];
          prompt_chips?: Json;
          client_action?: string | null;
          model?: string | null;
          transport?: string | null;
          request_metadata?: Json;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      ai_response_reports: {
        Row: {
          id: string;
          user_id: string;
          conversation_id: string;
          message_id: string;
          reason:
            | "inaccurate_financial_explanation"
            | "unsafe_or_offensive"
            | "privacy_concern"
            | "confusing_or_misleading"
            | "other";
          details: string | null;
          response_excerpt: string | null;
          platform: string;
          app_version: string | null;
          user_agent: string | null;
          status: "new" | "reviewed" | "dismissed" | "actioned";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          conversation_id: string;
          message_id: string;
          reason:
            | "inaccurate_financial_explanation"
            | "unsafe_or_offensive"
            | "privacy_concern"
            | "confusing_or_misleading"
            | "other";
          details?: string | null;
          response_excerpt?: string | null;
          platform?: string;
          app_version?: string | null;
          user_agent?: string | null;
          status?: "new" | "reviewed" | "dismissed" | "actioned";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: "new" | "reviewed" | "dismissed" | "actioned";
          updated_at?: string;
        };
        Relationships: [];
      };
      tester_feedback: {
        Row: {
          id: string;
          user_id: string | null;
          email: string | null;
          message: string;
          platform: string;
          app_version: string | null;
          user_agent: string | null;
          status: "new" | "reviewed" | "dismissed" | "actioned";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          email?: string | null;
          message: string;
          platform?: string;
          app_version?: string | null;
          user_agent?: string | null;
          status?: "new" | "reviewed" | "dismissed" | "actioned";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: "new" | "reviewed" | "dismissed" | "actioned";
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      accept_current_user_invite: {
        Args: never;
        Returns: void;
      };
      claim_agent_model_gate: {
        Args: {
          p_scope_hash: string;
          p_request_kind: string;
          p_minute_limit: number;
          p_day_limit: number;
          p_global_concurrency_limit: number;
          p_lease_ttl_seconds: number;
          p_now?: string;
        };
        Returns: {
          allowed: boolean;
          denial_reason: string | null;
          retry_after_seconds: number | null;
          lease_id: string | null;
        }[];
      };
      delete_current_user_financial_data: {
        Args: never;
        Returns: void;
      };
      is_beta_invited: {
        Args: {
          input_email: string;
        };
        Returns: boolean;
      };
      release_agent_model_gate: {
        Args: {
          p_lease_id: string;
          p_now?: string;
        };
        Returns: boolean;
      };
    };
  };
};

export type UserSettingsRow = Database["public"]["Tables"]["user_settings"]["Row"];
export type AccountRow = Database["public"]["Tables"]["accounts"]["Row"];
export type AccountPreferenceRow = Database["public"]["Tables"]["account_preferences"]["Row"];
export type SavingsGoalRow = Database["public"]["Tables"]["savings_goals"]["Row"];
export type RecurringObligationRuleRow = Database["public"]["Tables"]["recurring_obligation_rules"]["Row"];
export type TransactionRow = Database["public"]["Tables"]["transactions"]["Row"];
