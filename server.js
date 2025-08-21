// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "dist")));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper function to robustly parse the markdown response
function parseMealPlanMarkdown(markdown) {
  // This function expects a markdown format like:
  // ## Breakfast
  // - **Dish 1**: Dish Name
  //   - Benefit 1
  //   - Benefit 2
  //   - Benefit 3
  // - **Dish 2**: Dish Name
  //   - Benefit 1
  //   - Benefit 2
  //   - Benefit 3
  // ## Lunch
  // ... (same as above)
  // ## Dinner
  // ... (same as above)
  // ## Recommended Foods
  // - Food 1
  // - Food 2
  // - Food 3
  // ## Foods to Avoid
  // - Food 1
  // - Food 2
  // - Food 3

  const sections = {};
  const lines = markdown.split('\n');
  let currentSection = null;
  let currentDish = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Section headers
    if (/^##\s+/.test(line)) {
      currentSection = line.replace(/^##\s+/, '').toLowerCase();
      if (["breakfast", "lunch", "dinner"].includes(currentSection)) {
        sections[currentSection] = [];
      } else if (
        currentSection === "recommended foods" ||
        currentSection === "foods to avoid"
      ) {
        sections[currentSection.replace(/\s/g, '')] = [];
      }
      currentDish = null;
      continue;
    }

    // Dishes and benefits
    if (
      ["breakfast", "lunch", "dinner"].includes(currentSection) &&
      line.startsWith("- **Dish")
    ) {
      // Dish line: - **Dish 1**: Dish Name
      const match = line.match(/- \*\*Dish \d+\*\*: (.+)/);
      if (match) {
        currentDish = {
          dish: match[1].trim(),
          benefits: [],
        };
        sections[currentSection].push(currentDish);
      }
      continue;
    }

    // Benefits
    if (
      ["breakfast", "lunch", "dinner"].includes(currentSection) &&
      line.startsWith("- ") &&
      currentDish &&
      !line.startsWith("- **Dish")
    ) {
      // Benefit line: - Benefit text
      currentDish.benefits.push(line.replace(/^- /, '').trim());
      continue;
    }

    // Recommended and avoid foods
    if (
      (currentSection === "recommended foods" ||
        currentSection === "foods to avoid") &&
      line.startsWith("- ")
    ) {
      const key = currentSection.replace(/\s/g, '');
      sections[key].push(line.replace(/^- /, '').trim());
      continue;
    }
  }

  // Return in frontend-friendly format
  return {
    breakfast: sections.breakfast || [],
    lunch: sections.lunch || [],
    dinner: sections.dinner || [],
    recommended: sections.recommendedfoods || [],
    avoid: sections.foodstoavoid || [],
  };
}

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "DietMind backend is healthy" });
});

// API Route
app.post("/api/generate-meal-plan", async (req, res) => {
  try {
    const {
      dietaryPreference,
      allergies,
      ageStage,
      medicalConditions,
      activityLevel,
    } = req.body;

    const prompt = `
You are a nutrition expert. Based on the following parameters, generate a personalized Indian diet plan:

- Dietary Preference: ${dietaryPreference}
- Allergies: ${allergies?.length ? allergies.join(", ") : "None"}
- Age Stage: ${ageStage}
- Medical Conditions: ${medicalConditions?.length ? medicalConditions.join(", ") : "None"}
- Activity Level: ${activityLevel}

**Instructions:**
- For each meal (Breakfast, Lunch, Dinner), suggest 2 Indian dishes.
- For each dish, provide 3 health benefits (no preparation steps).
- All dishes must be Indian.
- Then, list 3 recommended foods and 3 foods to avoid.
- Respond strictly in the following markdown format:

## Breakfast
- **Dish 1**: Dish Name
  - Benefit 1
  - Benefit 2
  - Benefit 3
- **Dish 2**: Dish Name
  - Benefit 1
  - Benefit 2
  - Benefit 3

## Lunch
- **Dish 1**: Dish Name
  - Benefit 1
  - Benefit 2
  - Benefit 3
- **Dish 2**: Dish Name
  - Benefit 1
  - Benefit 2
  - Benefit 3

## Dinner
- **Dish 1**: Dish Name
  - Benefit 1
  - Benefit 2
  - Benefit 3
- **Dish 2**: Dish Name
  - Benefit 1
  - Benefit 2
  - Benefit 3

## Recommended Foods
- Food 1
- Food 2
- Food 3

## Foods to Avoid
- Food 1
- Food 2
- Food 3
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    const message = response.choices[0].message.content;

    let mealPlan;
    try {
      mealPlan = parseMealPlanMarkdown(message);
    } catch (err) {
      mealPlan = { raw: message };
    }

    res.json(mealPlan);
  } catch (error) {
    console.error("Error generating meal plan:", error);
    res.status(500).json({ error: "Failed to generate meal plan" });
  }
});

app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`✅ Server running on port ${PORT}`)
);
