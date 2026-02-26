#!/bin/bash

# Скрипт для восстановления app.js и применения интеграции
# Использование: bash RESTORE_AND_INTEGRATE.sh

set -e

echo "🔄 Восстановление app.js из коммита перед ошибкой..."

# Получаем SHA родительского коммита для 5b25dfe (коммит перед app-patch.js)
PARENT_COMMIT="603dba16420ece1f98e76338a4b0f395cc0547eb"

echo "📥 Получаем app.js из коммита $PARENT_COMMIT"
git show $PARENT_COMMIT:js/app.js > js/app.js

if [ ! -f "js/app.js" ]; then
  echo "❌ Ошибка: не удалось восстановить app.js"
  exit 1
fi

echo "✅ Файл app.js восстановлен"
echo ""
echo "📝 Теперь примените интеграцию вручную согласно INTEGRATION_TASK.md"
echo ""
echo "Или запустите интерактивную интеграцию:"
echo "  node integrate-colors.js"
echo ""
echo "После интеграции:"
echo "  git add js/app.js"
echo "  git commit -m 'feat: Complete integration of dynamic shift colors'"
echo "  git push origin feature/corporate-branding"
