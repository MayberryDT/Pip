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
      sync_status: "started" | "succeeded" | "failed" | "partial";
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
    };
    Views: Record<string, never>;
    Functions: {
      accept_current_user_invite: {
        Args: never;
        Returns: void;
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
    };
  };
};

export type UserSettingsRow = Database["public"]["Tables"]["user_settings"]["Row"];
export type AccountRow = Database["public"]["Tables"]["accounts"]["Row"];
export type AccountPreferenceRow = Database["public"]["Tables"]["account_preferences"]["Row"];
export type TransactionRow = Database["public"]["Tables"]["transactions"]["Row"];
