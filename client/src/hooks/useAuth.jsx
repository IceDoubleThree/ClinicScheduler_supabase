import { createContext, useState, useContext, useEffect } from "react";
import { supabase } from "../lib/supabase"; // Import Supabase client

// Create context
const AuthContext = createContext(null);

// Auth provider component
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On component mount, check for an active session
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { data: userData, error } = await supabase
            .from("users")
            .select("username, user_type")
            .eq("email", session.user.email)
            .single();

          if (error) throw error;

          setUser({ id: session.user.id, username: userData.username, user_type: userData.user_type });
        }
      } catch (error) {
        console.error("Error checking session:", error);
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        checkSession();
      } else {
        setUser(null);
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, []);
  // Login function
  const login = async (identifier, password) => {
    setLoading(true);
    try {
      if (!identifier || !password) {
        throw new Error("Username/Email and password are required");
      }

      let loginEmail = identifier;
      const isEmail = identifier.includes('@');

      // Only query the API if they are trying to log in with a username
      if (!isEmail) {
        try {
          const response = await fetch(
            `/api/lookup-username?username=${encodeURIComponent(identifier)}`
          );

          const { data } = await response.json();
          
          // If data is null, user doesn't exist
          if (!data || !data.email) {
            throw new Error("Invalid username or password");
          }
          
          loginEmail = data.email;
        } catch (err) {
          throw new Error("Invalid username or password");
        }
      }

      // Now attempt to sign in with Supabase Auth
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });

      if (authError) {
        throw new Error("Invalid credentials");
      }

      // Fetch the rest of the user details AFTER successful authentication
      // Now that they are logged in, RLS will allow this read
      const { data: profileData } = await supabase
        .from("users")
        .select("username, user_type")
        .eq("id", data.user.id)
        .single();

      setUser({
        id: data.user.id,
        username: profileData?.username || identifier,
        user_type: profileData?.user_type || 'user'
      });

      return { success: true, user_type: profileData?.user_type };
    } catch (error) {
      console.error("Login error:", error);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };  // Register function
  const register = async (email, password, user_type, username, phoneNumber) => {
    try {
      // Sign up user with Supabase Auth first
      // This will reject duplicate emails automatically
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            user_type,
            display_name: username
          }
        }
      });

      if (signUpError) {
        console.error("Signup error:", signUpError);
        throw new Error("Registration failed: " + signUpError.message);
      }

      if (!data?.user?.id) {
        throw new Error("Registration failed: No user ID received");
      }

      try {
        // Insert user into our custom users table with phone
        // This will fail if username is not unique (database constraint)
        const { error: insertError } = await supabase
          .from("users")
          .insert({
            id: data.user.id,
            email: email,
            username: username,
            user_type: user_type,
            phone: phoneNumber || null
          });

        if (insertError) {
          console.error("User insert error:", insertError);
          // If insertion fails, clean up the auth user
          await supabase.auth.signOut();
          
          // Check if it's a username uniqueness error
          if (insertError.message.includes("username")) {
            throw new Error("Username already exists");
          }
          
          throw new Error("Failed to create user profile: " + insertError.message);
        }

        // Set user state immediately after successful registration
        setUser({
          id: data.user.id,
          username: username,
          user_type: user_type,
          phone: phoneNumber || null
        });

        return { success: true, user_type: user_type };
      } catch (error) {
        console.error("User creation error:", error);
        // If insertion fails, clean up the auth user
        await supabase.auth.signOut();
        throw new Error("Failed to complete registration. Please try again.");
      }
    } catch (error) {
      console.error("Registration error:", error);
      return {
        success: false,
        error: error.message || "Registration failed. Please try again."
      };
    }
  };

  // Logout function
  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  // Check if user is an admin
  const isAdmin = () => user?.user_type === "admin";

  // Check if user is a doctor
  const isDoctor = () => user?.user_type === "doctor";

  // Check if user is a regular user
  const isUser = () => user?.user_type === "user";

  const authContextValue = {
    user,
    loading,
    login,
    register,
    logout,
    isAdmin,
    isDoctor,
    isUser
  };

  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export default useAuth;